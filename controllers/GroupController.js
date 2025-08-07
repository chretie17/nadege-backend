const db = require('../config/db');

// Get all groups
exports.getGroups = (req, res) => {
    const query = `
        SELECT 
            g.*,
            u.name as creator_name,
            COUNT(DISTINCT gm.user_id) as member_count,
            COUNT(DISTINCT gp.id) as post_count,
            MAX(gp.created_at) as last_activity
        FROM 
            \`groups\` g
        JOIN 
            users u ON g.created_by = u.id
        LEFT JOIN 
            group_members gm ON g.id = gm.group_id AND gm.status = 'active'
        LEFT JOIN 
            group_posts gp ON g.id = gp.group_id
        WHERE 
            g.status = 'active' AND g.privacy != 'private'
        GROUP BY 
            g.id
        ORDER BY 
            last_activity DESC, g.created_at DESC
    `;
    
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
};

// Get user's groups
exports.getUserGroups = (req, res) => {
    const { userId } = req.params;
    
    const query = `
        SELECT 
            g.*,
            u.name as creator_name,
            COUNT(DISTINCT gm2.user_id) as member_count,
            COUNT(DISTINCT gp.id) as post_count,
            MAX(gp.created_at) as last_activity,
            gm.role as user_role
        FROM 
            \`groups\` g
        JOIN 
            users u ON g.created_by = u.id
        JOIN 
            group_members gm ON g.id = gm.group_id AND gm.user_id = ? AND gm.status = 'active'
        LEFT JOIN 
            group_members gm2 ON g.id = gm2.group_id AND gm2.status = 'active'
        LEFT JOIN 
            group_posts gp ON g.id = gp.group_id
        WHERE 
            g.status = 'active'
        GROUP BY 
            g.id, gm.role
        ORDER BY 
            last_activity DESC, g.created_at DESC
    `;
    
    db.query(query, [userId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
};

// Get a specific group with its posts
exports.getGroup = (req, res) => {
    const { id } = req.params;
    const { userId } = req.query;
    
    const groupQuery = `
        SELECT 
            g.*,
            u.name as creator_name,
            COUNT(DISTINCT gm.user_id) as member_count
        FROM 
            \`groups\` g
        JOIN 
            users u ON g.created_by = u.id
        LEFT JOIN 
            group_members gm ON g.id = gm.group_id AND gm.status = 'active'
        WHERE 
            g.id = ? AND g.status = 'active'
        GROUP BY 
            g.id
    `;
    
    const membershipQuery = `
        SELECT role, status 
        FROM group_members 
        WHERE group_id = ? AND user_id = ?
    `;
    
    const postsQuery = `
        SELECT 
            gp.*,
            u.name as user_name,
            (SELECT COUNT(*) FROM group_post_likes gpl WHERE gpl.post_id = gp.id AND gpl.like_type = 'like') as likes,
            (SELECT COUNT(*) FROM group_post_likes gpl WHERE gpl.post_id = gp.id AND gpl.like_type = 'dislike') as dislikes
        FROM 
            group_posts gp
        JOIN 
            users u ON gp.user_id = u.id
        WHERE 
            gp.group_id = ?
        ORDER BY 
            gp.created_at DESC
    `;
    
    db.query(groupQuery, [id], (err, groupResults) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (groupResults.length === 0) {
            return res.status(404).json({ error: 'Group not found' });
        }
        
        const group = groupResults[0];
        
        // Check user membership if userId is provided
        if (userId) {
            db.query(membershipQuery, [id, userId], (err, membershipResults) => {
                if (err) return res.status(500).json({ error: err.message });
                
                const membership = membershipResults.length > 0 ? membershipResults[0] : null;
                
                // Check if user can view posts (public groups or members)
                if (group.privacy === 'private' && (!membership || membership.status !== 'active')) {
                    return res.json({
                        ...group,
                        user_membership: membership,
                        posts: [],
                        can_view_posts: false
                    });
                }
                
                // Get posts
                db.query(postsQuery, [id], (err, postsResults) => {
                    if (err) return res.status(500).json({ error: err.message });
                    
                    res.json({
                        ...group,
                        user_membership: membership,
                        posts: postsResults,
                        can_view_posts: true
                    });
                });
            });
        } else {
            // Public access - only show if group is public
            if (group.privacy === 'private') {
                return res.status(403).json({ error: 'Access denied' });
            }
            
            db.query(postsQuery, [id], (err, postsResults) => {
                if (err) return res.status(500).json({ error: err.message });
                
                res.json({
                    ...group,
                    posts: postsResults,
                    can_view_posts: true
                });
            });
        }
    });
};

// Create a new group
exports.createGroup = (req, res) => {
    const { name, description, privacy, category, created_by } = req.body;
    
    if (!name || !created_by) {
        return res.status(400).json({ error: 'Group name and creator ID are required' });
    }
    
    const validPrivacyLevels = ['public', 'private'];
    if (privacy && !validPrivacyLevels.includes(privacy)) {
        return res.status(400).json({ error: 'Invalid privacy level' });
    }
    
    const groupQuery = `
        INSERT INTO \`groups\` (name, description, privacy, category, created_by)
        VALUES (?, ?, ?, ?, ?)
    `;
    
    db.query(groupQuery, [name, description || null, privacy || 'public', category || null, created_by], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const groupId = result.insertId;
        
        // Add creator as admin member
        const memberQuery = `
            INSERT INTO group_members (group_id, user_id, role, status)
            VALUES (?, ?, 'admin', 'active')
        `;
        
        db.query(memberQuery, [groupId, created_by], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            
            res.status(201).json({ 
                message: 'Group created successfully',
                group_id: groupId
            });
        });
    });
};

// Join a group
exports.joinGroup = (req, res) => {
    const { groupId, userId } = req.body;
    
    if (!groupId || !userId) {
        return res.status(400).json({ error: 'Group ID and user ID are required' });
    }
    
    // Check if user is already a member
    const checkQuery = `
        SELECT * FROM group_members 
        WHERE group_id = ? AND user_id = ?
    `;
    
    db.query(checkQuery, [groupId, userId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (results.length > 0) {
            if (results[0].status === 'active') {
                return res.status(400).json({ error: 'User is already a member of this group' });
            } else {
                // Reactivate membership
                const updateQuery = `
                    UPDATE group_members 
                    SET status = 'active', joined_at = CURRENT_TIMESTAMP
                    WHERE group_id = ? AND user_id = ?
                `;
                
                db.query(updateQuery, [groupId, userId], (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ message: 'Successfully rejoined group' });
                });
            }
        } else {
            // Add new member
            const insertQuery = `
                INSERT INTO group_members (group_id, user_id, role, status)
                VALUES (?, ?, 'member', 'active')
            `;
            
            db.query(insertQuery, [groupId, userId], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'Successfully joined group' });
            });
        }
    });
};

// Leave a group
exports.leaveGroup = (req, res) => {
    const { groupId, userId } = req.body;
    
    if (!groupId || !userId) {
        return res.status(400).json({ error: 'Group ID and user ID are required' });
    }
    
    const query = `
        UPDATE group_members 
        SET status = 'inactive'
        WHERE group_id = ? AND user_id = ? AND role != 'admin'
    `;
    
    db.query(query, [groupId, userId], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (result.affectedRows === 0) {
            return res.status(400).json({ error: 'Cannot leave group (not a member or admin)' });
        }
        
        res.json({ message: 'Successfully left group' });
    });
};

// Create a group post
exports.createGroupPost = (req, res) => {
    const { group_id, user_id, content } = req.body;
    
    if (!group_id || !user_id || !content) {
        return res.status(400).json({ error: 'Group ID, user ID, and content are required' });
    }
    
    // Check if user is a member of the group
    const memberQuery = `
        SELECT * FROM group_members 
        WHERE group_id = ? AND user_id = ? AND status = 'active'
    `;
    
    db.query(memberQuery, [group_id, user_id], (err, memberResults) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (memberResults.length === 0) {
            return res.status(403).json({ error: 'You must be a member to post in this group' });
        }
        
        const postQuery = `
            INSERT INTO group_posts (group_id, user_id, content)
            VALUES (?, ?, ?)
        `;
        
        db.query(postQuery, [group_id, user_id, content], (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            
            res.status(201).json({ 
                message: 'Post created successfully',
                post_id: result.insertId
            });
        });
    });
};

// Like/dislike a group post
exports.likeGroupPost = (req, res) => {
    const { post_id, user_id, like_type } = req.body;
    
    if (!post_id || !user_id || !like_type) {
        return res.status(400).json({ error: 'Post ID, user ID, and like type are required' });
    }
    
    if (!['like', 'dislike'].includes(like_type)) {
        return res.status(400).json({ error: 'Like type must be either "like" or "dislike"' });
    }
    
    // Check if user has already liked/disliked this post
    const checkQuery = `
        SELECT * FROM group_post_likes 
        WHERE post_id = ? AND user_id = ?
    `;
    
    db.query(checkQuery, [post_id, user_id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (results.length > 0) {
            return res.status(400).json({ error: 'You have already rated this post' });
        }
        
        const insertQuery = `
            INSERT INTO group_post_likes (post_id, user_id, like_type)
            VALUES (?, ?, ?)
        `;
        
        db.query(insertQuery, [post_id, user_id, like_type], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: `Post ${like_type}d successfully` });
        });
    });
};

// Get group members
exports.getGroupMembers = (req, res) => {
    const { groupId } = req.params;
    
    const query = `
        SELECT 
            gm.*,
            u.name as user_name,
            u.email as user_email
        FROM 
            group_members gm
        JOIN 
            users u ON gm.user_id = u.id
        WHERE 
            gm.group_id = ? AND gm.status = 'active'
        ORDER BY 
            CASE gm.role 
                WHEN 'admin' THEN 1 
                WHEN 'moderator' THEN 2 
                ELSE 3 
            END,
            gm.joined_at ASC
    `;
    
    db.query(query, [groupId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
};