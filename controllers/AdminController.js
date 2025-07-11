const db = require('../config/db');

// Success Stories Management

exports.getAllSuccessStories = (req, res) => {
    const query = `
        SELECT 
            ss.*,
            CASE WHEN ss.is_anonymous THEN 'Anonymous' ELSE u.name END as author_name
        FROM 
            success_stories ss
        JOIN 
            users u ON ss.user_id = u.id
        ORDER BY 
            ss.created_at DESC
    `;
    
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
};

exports.updateSuccessStory = (req, res) => {
    const { id } = req.params;
    const { title, content, is_featured, is_approved } = req.body;
    
    let updateFields = [];
    let queryParams = [];
    
    if (title !== undefined) {
        updateFields.push('title = ?');
        queryParams.push(title);
    }
    
    if (content !== undefined) {
        updateFields.push('content = ?');
        queryParams.push(content);
    }
    
    if (is_featured !== undefined) {
        updateFields.push('is_featured = ?');
        queryParams.push(is_featured);
    }
    
    if (is_approved !== undefined) {
        updateFields.push('is_approved = ?');
        queryParams.push(is_approved);
    }
    
    if (updateFields.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
    }
    
    queryParams.push(id);
    
    const query = `
        UPDATE success_stories
        SET ${updateFields.join(', ')}
        WHERE id = ?
    `;
    
    db.query(query, queryParams, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Story not found' });
        }
        
        res.json({ message: 'Story updated successfully' });
    });
};

exports.deleteSuccessStory = (req, res) => {
    const { id } = req.params;
    
    const query = `
        DELETE FROM success_stories
        WHERE id = ?
    `;
    
    db.query(query, [id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Story not found' });
        }
        
        res.json({ message: 'Story deleted successfully' });
    });
};

// Forum Management

exports.getAllForumTopics = (req, res) => {
    const query = `
        SELECT 
            ft.*, 
u.name as creator_name,
            COUNT(fp.id) as post_count,
            MAX(fp.created_at) as last_post_date,
            (SELECT COUNT(*) > 0 FROM content_flags cf WHERE cf.content_type = 'topic' AND cf.content_id = ft.id) as is_flagged,
            ft.is_pinned
        FROM 
            forum_topics ft
        JOIN 
            users u ON ft.created_by = u.id
        LEFT JOIN 
            forum_posts fp ON ft.id = fp.topic_id
        GROUP BY 
            ft.id
        ORDER BY 
            ft.is_pinned DESC,
            last_post_date DESC
    `;
    
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
};

exports.getTopicPosts = (req, res) => {
    const { id } = req.params;
    
    const query = `
        SELECT 
            fp.*,
            u.name as user_name,
            (SELECT COUNT(*) > 0 FROM content_flags cf WHERE cf.content_type = 'post' AND cf.content_id = fp.id) as is_flagged
        FROM 
            forum_posts fp
        JOIN 
            users u ON fp.user_id = u.id
        WHERE 
            fp.topic_id = ?
        ORDER BY 
            fp.created_at ASC
    `;
    
    db.query(query, [id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
};

exports.updateForumTopic = (req, res) => {
    const { id } = req.params;
    const { title, description, is_pinned } = req.body;
    
    let updateFields = [];
    let queryParams = [];
    
    if (title !== undefined) {
        updateFields.push('title = ?');
        queryParams.push(title);
    }
    
    if (description !== undefined) {
        updateFields.push('description = ?');
        queryParams.push(description);
    }
    
    if (is_pinned !== undefined) {
        updateFields.push('is_pinned = ?');
        queryParams.push(is_pinned);
    }
    
    if (updateFields.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
    }
    
    queryParams.push(id);
    
    const query = `
        UPDATE forum_topics
        SET ${updateFields.join(', ')}
        WHERE id = ?
    `;
    
    db.query(query, queryParams, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Topic not found' });
        }
        
        res.json({ message: 'Topic updated successfully' });
    });
};

exports.deleteForumTopic = (req, res) => {
    const { id } = req.params;
    
    // Start a transaction to ensure both queries run or neither runs
    db.beginTransaction(err => {
        if (err) return res.status(500).json({ error: err.message });
        
        // First delete all posts associated with the topic
        const deletePostsQuery = `
            DELETE FROM forum_posts
            WHERE topic_id = ?
        `;
        
        db.query(deletePostsQuery, [id], (err, _) => {
            if (err) {
                return db.rollback(() => {
                    res.status(500).json({ error: err.message });
                });
            }
            
            // Then delete the topic itself
            const deleteTopicQuery = `
                DELETE FROM forum_topics
                WHERE id = ?
            `;
            
            db.query(deleteTopicQuery, [id], (err, result) => {
                if (err) {
                    return db.rollback(() => {
                        res.status(500).json({ error: err.message });
                    });
                }
                
                if (result.affectedRows === 0) {
                    return db.rollback(() => {
                        res.status(404).json({ error: 'Topic not found' });
                    });
                }
                
                // Commit the transaction
                db.commit(err => {
                    if (err) {
                        return db.rollback(() => {
                            res.status(500).json({ error: err.message });
                        });
                    }
                    
                    res.json({ message: 'Topic and all associated posts deleted successfully' });
                });
            });
        });
    });
};

exports.updateForumPost = (req, res) => {
    const { id } = req.params;
    const { content, is_hidden } = req.body;
    
    let updateFields = [];
    let queryParams = [];
    
    if (content !== undefined) {
        updateFields.push('content = ?');
        queryParams.push(content);
    }
    
    if (is_hidden !== undefined) {
        updateFields.push('is_hidden = ?');
        queryParams.push(is_hidden);
    }
    
    if (updateFields.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
    }
    
    queryParams.push(id);
    
    const query = `
        UPDATE forum_posts
        SET ${updateFields.join(', ')}
        WHERE id = ?
    `;
    
    db.query(query, queryParams, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Post not found' });
        }
        
        res.json({ message: 'Post updated successfully' });
    });
};

exports.deleteForumPost = (req, res) => {
    const { id } = req.params;
    
    const query = `
        DELETE FROM forum_posts
        WHERE id = ?
    `;
    
    db.query(query, [id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Post not found' });
        }
        
        res.json({ message: 'Post deleted successfully' });
    });
};

// Flagged Content Management

exports.getFlaggedContent = (req, res) => {
    const query = `
        SELECT 
            cf.content_type as type,
            cf.content_id as id,
            cf.created_at as flagged_at,
            cf.reason,
            CASE 
                WHEN cf.content_type = 'topic' THEN ft.title
                ELSE NULL
            END as title,
            CASE 
                WHEN cf.content_type = 'topic' THEN ft.description
                WHEN cf.content_type = 'post' THEN fp.content
                ELSE NULL
            END as content,
            CASE 
                WHEN cf.content_type = 'topic' THEN u1.name
                WHEN cf.content_type = 'post' THEN u2.name
                ELSE NULL
            END as author_name,
            CASE 
                WHEN cf.content_type = 'post' THEN t.title
                ELSE NULL
            END as topic_title
        FROM 
            content_flags cf
        LEFT JOIN 
            forum_topics ft ON cf.content_type = 'topic' AND cf.content_id = ft.id
        LEFT JOIN 
            forum_posts fp ON cf.content_type = 'post' AND cf.content_id = fp.id
        LEFT JOIN 
            users u1 ON cf.content_type = 'topic' AND ft.created_by = u1.id
        LEFT JOIN 
            users u2 ON cf.content_type = 'post' AND fp.user_id = u2.id
        LEFT JOIN 
            forum_topics t ON cf.content_type = 'post' AND fp.topic_id = t.id
        ORDER BY 
            cf.created_at DESC
    `;
    
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
};

exports.approveFlaggedContent = (req, res) => {
    const { type, id } = req.params;
    
    const query = `
        DELETE FROM content_flags
        WHERE content_type = ? AND content_id = ?
    `;
    
    db.query(query, [type, id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Flagged content not found' });
        }
        
        res.json({ message: 'Content approved and flag removed' });
    });
};

exports.deleteFlaggedContent = (req, res) => {
    const { type, id } = req.params;
    
    // Start a transaction
    db.beginTransaction(err => {
        if (err) return res.status(500).json({ error: err.message });
        
        // First, determine which content to delete
        let deleteContentQuery = '';
        if (type === 'topic') {
            // Delete topic (this should cascade to delete posts if your DB is set up correctly)
            deleteContentQuery = `DELETE FROM forum_topics WHERE id = ?`;
        } else if (type === 'post') {
            // Delete just the post
            deleteContentQuery = `DELETE FROM forum_posts WHERE id = ?`;
        } else {
            return db.rollback(() => {
                res.status(400).json({ error: 'Invalid content type' });
            });
        }
        
        // Delete the content
        db.query(deleteContentQuery, [id], (err, result) => {
            if (err) {
                return db.rollback(() => {
                    res.status(500).json({ error: err.message });
                });
            }
            
            if (result.affectedRows === 0) {
                return db.rollback(() => {
                    res.status(404).json({ error: 'Content not found' });
                });
            }
            
            // Then delete the flag (if your database doesn't have CASCADE DELETE constraints)
            const deleteFlagQuery = `
                DELETE FROM content_flags
                WHERE content_type = ? AND content_id = ?
            `;
            
            db.query(deleteFlagQuery, [type, id], (err, _) => {
                if (err) {
                    return db.rollback(() => {
                        res.status(500).json({ error: err.message });
                    });
                }
                
                // Commit the transaction
                db.commit(err => {
                    if (err) {
                        return db.rollback(() => {
                            res.status(500).json({ error: err.message });
                        });
                    }
                    
                    res.json({ message: `${type} deleted successfully` });
                });
            });
        });
    });
};

// Admin Dashboard Stats

exports.getAdminStats = (req, res) => {
    // Use a transaction to ensure consistent stats
    db.beginTransaction(async (err) => {
        if (err) return res.status(500).json({ error: err.message });
        
        try {
            // Run queries in parallel using promises
            const topicsCountPromise = new Promise((resolve, reject) => {
                db.query('SELECT COUNT(*) as count FROM forum_topics', (err, results) => {
                    if (err) reject(err);
                    else resolve(results[0].count);
                });
            });
            
            const postsCountPromise = new Promise((resolve, reject) => {
                db.query('SELECT COUNT(*) as count FROM forum_posts', (err, results) => {
                    if (err) reject(err);
                    else resolve(results[0].count);
                });
            });
            
            const storiesCountPromise = new Promise((resolve, reject) => {
                db.query('SELECT COUNT(*) as count FROM success_stories', (err, results) => {
                    if (err) reject(err);
                    else resolve(results[0].count);
                });
            });
            
            const pendingStoriesPromise = new Promise((resolve, reject) => {
                db.query('SELECT COUNT(*) as count FROM success_stories WHERE is_approved = false', (err, results) => {
                    if (err) reject(err);
                    else resolve(results[0].count);
                });
            });
            
            const flaggedContentPromise = new Promise((resolve, reject) => {
                db.query('SELECT COUNT(*) as count FROM content_flags', (err, results) => {
                    if (err) reject(err);
                    else resolve(results[0].count);
                });
            });
            
            // Get all results
            const [
                topicsCount,
                postsCount,
                storiesCount,
                pendingStories,
                flaggedContent
            ] = await Promise.all([
                topicsCountPromise,
                postsCountPromise,
                storiesCountPromise,
                pendingStoriesPromise,
                flaggedContentPromise
            ]);
            
            // Commit the transaction
            db.commit(err => {
                if (err) {
                    return db.rollback(() => {
                        res.status(500).json({ error: err.message });
                    });
                }
                
                // Return the stats
                res.json({
                    topics: topicsCount,
                    posts: postsCount,
                    stories: {
                        total: storiesCount,
                        pending: pendingStories
                    },
                    flaggedContent: flaggedContent
                });
            });
        } catch (error) {
            db.rollback(() => {
                res.status(500).json({ error: error.message });
            });
        }
    });
};