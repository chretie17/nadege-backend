const db = require('../config/db');

// Controller for EmpowerLink system reports with date range and search
const reportsController = {
    // 1. User Overview Report
    getUserOverviewReport: (req, res) => {
        try {
            // Extract date range and search query from request
            const { startDate, endDate, search } = req.query;
            
            // The WHERE clause should start with WHERE
            const dateFilter = startDate || endDate ? getDateRangeFilter(startDate, endDate, 'users.created_at', true) : '';
            const searchFilter = search ? (dateFilter ? ' AND ' : ' WHERE ') + `(users.name LIKE ? OR users.email LIKE ? OR users.username LIKE ?)` : '';
            const searchParams = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];
            
            db.query(
                `SELECT role, COUNT(*) as count 
                FROM users 
                ${dateFilter} ${searchFilter}
                GROUP BY role`,
                [...getDateParams(startDate, endDate), ...searchParams],
                (err, usersByRole) => {
                    if (err) return res.status(500).json({ error: err.message });
                    
                    db.query(
                        `SELECT id, username, name, email, role, created_at 
                        FROM users 
                        ${dateFilter} ${searchFilter}
                        ORDER BY created_at DESC
                        LIMIT 50`,
                        [...getDateParams(startDate, endDate), ...searchParams],
                        (err, recentUsers) => {
                            if (err) return res.status(500).json({ error: err.message });
                            
                            db.query(
                                `SELECT id, username, name, email, role,
                                    CASE
                                        WHEN skills IS NOT NULL AND LENGTH(skills) > 10 THEN 1
                                        ELSE 0
                                    END +
                                    CASE
                                        WHEN education IS NOT NULL AND LENGTH(education) > 10 THEN 1
                                        ELSE 0
                                    END +
                                    CASE
                                        WHEN experience IS NOT NULL AND LENGTH(experience) > 10 THEN 1
                                        ELSE 0
                                    END +
                                    CASE
                                        WHEN (SELECT COUNT(*) FROM user_skills WHERE user_id = users.id) > 0 THEN 1
                                        ELSE 0
                                    END AS completeness_score
                                FROM users
                                WHERE role = 'user' ${dateFilter ? 'AND' + dateFilter.substring(5) : ''} ${search ? 'AND ' + searchFilter.substring(6) : ''}
                                ORDER BY completeness_score DESC
                                LIMIT 10`,
                                [...getDateParams(startDate, endDate), ...searchParams],
                                (err, completeProfiles) => {
                                    if (err) return res.status(500).json({ error: err.message });
                                    
                                    const skillJoinCondition = dateFilter ? 
                                        ` JOIN users u ON us.user_id = u.id ${dateFilter.replace('users.', 'u.')} ${searchFilter.replace('users.', 'u.')}` :
                                        ` JOIN users u ON us.user_id = u.id ${searchFilter.replace('users.', 'u.')}`;
                                        
                                    db.query(
                                        `SELECT sc.name as category_name, COUNT(DISTINCT us.user_id) as user_count
                                        FROM skills_categories sc
                                        JOIN skills s ON sc.id = s.category_id
                                        JOIN user_skills us ON s.id = us.skill_id
                                        ${skillJoinCondition}
                                        GROUP BY sc.id
                                        ORDER BY user_count DESC`,
                                        [...getDateParams(startDate, endDate), ...searchParams],
                                        (err, usersBySkillCategory) => {
                                            if (err) return res.status(500).json({ error: err.message });
                                            
                                            res.json({
                                                usersByRole,
                                                recentUsers,
                                                completeProfiles,
                                                usersBySkillCategory,
                                                metadata: {
                                                    dateRange: {
                                                        startDate: startDate || null,
                                                        endDate: endDate || null
                                                    },
                                                    search: search || null
                                                }
                                            });
                                        }
                                    );
                                }
                            );
                        }
                    );
                }
            );
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // 2. Job Market Snapshot
    getJobMarketSnapshot: (req, res) => {
        try {
            // Extract date range and search query from request
            const { startDate, endDate, search } = req.query;
            
            const dateFilter = startDate || endDate ? getDateRangeFilter(startDate, endDate, 'jobs.created_at', true) : '';
            const searchFilter = search ? (dateFilter ? ' AND ' : ' WHERE ') + `(jobs.title LIKE ? OR jobs.location LIKE ? OR jobs.skills_required LIKE ?)` : '';
            const searchParams = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];
            
            db.query(
                `SELECT COUNT(*) as total_jobs, 
                COUNT(CASE WHEN application_deadline >= CURDATE() THEN 1 END) as active_jobs
                FROM jobs
                ${dateFilter} ${searchFilter}`,
                [...getDateParams(startDate, endDate), ...searchParams],
                (err, totalJobsResults) => {
                    if (err) return res.status(500).json({ error: err.message });
                    const totalJobs = totalJobsResults[0];
                    
                    db.query(
                        `SELECT location, COUNT(*) as job_count
                        FROM jobs
                        ${dateFilter} ${searchFilter}
                        GROUP BY location
                        ORDER BY job_count DESC
                        LIMIT 5`,
                        [...getDateParams(startDate, endDate), ...searchParams],
                        (err, jobsByLocation) => {
                            if (err) return res.status(500).json({ error: err.message });
                            
                            db.query(
                                `SELECT skills_required, COUNT(*) as job_count
                                FROM jobs
                                WHERE skills_required IS NOT NULL ${dateFilter ? 'AND' + dateFilter.substring(5) : ''} ${search ? 'AND ' + searchFilter.substring(6) : ''}
                                GROUP BY skills_required
                                ORDER BY job_count DESC
                                LIMIT 10`,
                                [...getDateParams(startDate, endDate), ...searchParams],
                                (err, mostRequestedSkills) => {
                                    if (err) return res.status(500).json({ error: err.message });
                                    
                                    const appDateFilter = startDate || endDate ? getDateRangeFilter(startDate, endDate, 'job_applications.applied_at', true) : '';
                                    
                                    db.query(
                                        `SELECT 
                                            COUNT(*) as total_applications,
                                            COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted_applications,
                                            COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_applications,
                                            COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_applications,
                                            COUNT(CASE WHEN status = 'interviewing' THEN 1 END) as interviewing_applications,
                                            ROUND(IFNULL(COUNT(CASE WHEN status = 'accepted' THEN 1 END) / NULLIF(COUNT(*), 0) * 100, 0), 2) as success_rate
                                        FROM job_applications
                                        JOIN jobs ON job_applications.job_id = jobs.id
                                        ${appDateFilter} ${searchFilter.replace('jobs.', 'jobs.')}`,
                                        [...getDateParams(startDate, endDate), ...searchParams],
                                        (err, applicationStatsResults) => {
                                            if (err) return res.status(500).json({ error: err.message });
                                            const applicationStats = applicationStatsResults[0];
                                            
                                            res.json({
                                                totalJobs,
                                                jobsByLocation,
                                                mostRequestedSkills,
                                                applicationStats,
                                                metadata: {
                                                    dateRange: {
                                                        startDate: startDate || null,
                                                        endDate: endDate || null
                                                    },
                                                    search: search || null
                                                }
                                            });
                                        }
                                    );
                                }
                            );
                        }
                    );
                }
            );
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // 3. Skills Assessment Summary
    getSkillsAssessmentSummary: (req, res) => {
        try {
            // Extract date range and search query from request
            const { startDate, endDate, search } = req.query;
            
            const dateFilter = startDate || endDate ? getDateRangeFilter(startDate, endDate, 'us.assessed_at', true) : '';
            const searchFilter = search ? (dateFilter ? ' AND ' : ' WHERE ') + `(s.name LIKE ? OR sc.name LIKE ?)` : '';
            const searchParams = search ? [`%${search}%`, `%${search}%`] : [];
            
            const baseQuery = `
                FROM skills s
                JOIN user_skills us ON s.id = us.skill_id
                JOIN users u ON us.user_id = u.id
                JOIN skills_categories sc ON s.category_id = sc.id
                ${dateFilter} ${searchFilter} ${dateFilter || searchFilter ? 'AND' : 'WHERE'} u.role = 'user'
            `;
            
            db.query(
                `SELECT s.name as skill_name, COUNT(us.user_id) as user_count
                ${baseQuery}
                GROUP BY s.id
                ORDER BY user_count DESC
                LIMIT 10`,
                [...getDateParams(startDate, endDate), ...searchParams],
                (err, commonSkills) => {
                    if (err) return res.status(500).json({ error: err.message });
                    
                    db.query(
                        `SELECT s.name as skill_name, 
                        ROUND(AVG(us.proficiency_level), 2) as avg_proficiency,
                        COUNT(us.user_id) as user_count
                        ${baseQuery}
                        GROUP BY s.id
                        ORDER BY avg_proficiency DESC
                        LIMIT 10`,
                        [...getDateParams(startDate, endDate), ...searchParams],
                        (err, averageProficiency) => {
                            if (err) return res.status(500).json({ error: err.message });
                            
                            // For skill gap, we need to modify the query slightly
                            const gapQuery = `
                                FROM skills s
                                LEFT JOIN user_skills us ON s.id = us.skill_id
                                JOIN skills_categories sc ON s.category_id = sc.id
                                ${dateFilter.replace('us.', 'us.')} ${searchFilter}
                            `;
                            
                            db.query(
                                `SELECT s.name as skill_name,
                                COUNT(DISTINCT us.user_id) as supply_count,
                                (SELECT COUNT(*) FROM jobs j 
                                 WHERE j.skills_required LIKE CONCAT('%', s.name, '%')) as demand_count,
                                (SELECT COUNT(*) FROM jobs j 
                                 WHERE j.skills_required LIKE CONCAT('%', s.name, '%')) - COUNT(DISTINCT us.user_id) as gap
                                ${gapQuery}
                                GROUP BY s.id
                                HAVING demand_count > 0
                                ORDER BY gap DESC
                                LIMIT 10`,
                                [...getDateParams(startDate, endDate), ...searchParams],
                                (err, skillGap) => {
                                    if (err) return res.status(500).json({ error: err.message });
                                    
                                    db.query(
                                        `SELECT u.id, u.name, u.username, u.email,
                                        COUNT(us.skill_id) as skills_count,
                                        ROUND(AVG(us.proficiency_level), 2) as avg_proficiency,
                                        COUNT(CASE WHEN us.proficiency_level >= 4 THEN 1 END) as expert_skills_count
                                        ${baseQuery}
                                        GROUP BY u.id
                                        ORDER BY avg_proficiency DESC, expert_skills_count DESC
                                        LIMIT 10`,
                                        [...getDateParams(startDate, endDate), ...searchParams],
                                        (err, topSkilledUsers) => {
                                            if (err) return res.status(500).json({ error: err.message });
                                            
                                            res.json({
                                                commonSkills,
                                                averageProficiency,
                                                skillGap,
                                                topSkilledUsers,
                                                metadata: {
                                                    dateRange: {
                                                        startDate: startDate || null,
                                                        endDate: endDate || null
                                                    },
                                                    search: search || null
                                                }
                                            });
                                        }
                                    );
                                }
                            );
                        }
                    );
                }
            );
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // 4. Community Engagement Metrics
    getCommunityEngagementMetrics: (req, res) => {
        try {
            // Extract date range and search query from request
            const { startDate, endDate, search } = req.query;
            
            // Get basic forum stats without date filtering first
            db.query(
                `SELECT
                    COUNT(*) as total_topics FROM forum_topics`,
                [],
                (err, topicsResult) => {
                    if (err) return res.status(500).json({ error: err.message });
                    
                    db.query(
                        `SELECT
                            COUNT(*) as total_posts FROM forum_posts`,
                        [],
                        (err, postsResult) => {
                            if (err) return res.status(500).json({ error: err.message });
                            
                            db.query(
                                `SELECT 
                                    COUNT(DISTINCT user_id) as active_users FROM forum_posts`,
                                [],
                                (err, usersResult) => {
                                    if (err) return res.status(500).json({ error: err.message });
                                    
                                    db.query(
                                        `SELECT 
                                            COUNT(*) as new_topics_30d FROM forum_topics 
                                            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
                                        [],
                                        (err, newTopicsResult) => {
                                            if (err) return res.status(500).json({ error: err.message });
                                            
                                            db.query(
                                                `SELECT 
                                                    COUNT(*) as new_posts_30d FROM forum_posts 
                                                    WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
                                                [],
                                                (err, newPostsResult) => {
                                                    if (err) return res.status(500).json({ error: err.message });
                                                    
                                                    // Combine forum stats
                                                    const forumActivity = {
                                                        total_topics: topicsResult[0].total_topics,
                                                        total_posts: postsResult[0].total_posts,
                                                        active_users: usersResult[0].active_users,
                                                        new_topics_30d: newTopicsResult[0].new_topics_30d,
                                                        new_posts_30d: newPostsResult[0].new_posts_30d
                                                    };
                                                    
                                                    // Continue with success stories
                                                    let storyQuery = `SELECT 
                                                        COUNT(*) as total_stories,
                                                        COUNT(CASE WHEN is_approved = 1 THEN 1 END) as approved_stories,
                                                        COUNT(CASE WHEN is_approved = 0 THEN 1 END) as pending_stories,
                                                        COUNT(CASE WHEN is_anonymous = 1 THEN 1 END) as anonymous_stories
                                                    FROM success_stories`;
                                                    
                                                    let storyParams = [];
                                                    
                                                    if (startDate && endDate) {
                                                        storyQuery += ` WHERE created_at BETWEEN ? AND ?`;
                                                        storyParams = [startDate, endDate];
                                                    } else if (startDate) {
                                                        storyQuery += ` WHERE created_at >= ?`;
                                                        storyParams = [startDate];
                                                    } else if (endDate) {
                                                        storyQuery += ` WHERE created_at <= ?`;
                                                        storyParams = [endDate];
                                                    }
                                                    
                                                    db.query(
                                                        storyQuery,
                                                        storyParams,
                                                        (err, successStoriesResults) => {
                                                            if (err) return res.status(500).json({ error: err.message });
                                                            const successStories = successStoriesResults[0];
                                                            
                                                            // Most engaged users
                                                            let usersQuery = `SELECT u.id, u.name, u.username, u.role,
                                                                COUNT(fp.id) as post_count,
                                                                COUNT(DISTINCT ft.id) as topics_participated
                                                            FROM users u
                                                            JOIN forum_posts fp ON u.id = fp.user_id
                                                            JOIN forum_topics ft ON fp.topic_id = ft.id`;
                                                            
                                                            let whereAdded = false;
                                                            let userParams = [];
                                                            
                                                            if (startDate && endDate) {
                                                                usersQuery += ` WHERE fp.created_at BETWEEN ? AND ?`;
                                                                userParams = [startDate, endDate];
                                                                whereAdded = true;
                                                            } else if (startDate) {
                                                                usersQuery += ` WHERE fp.created_at >= ?`;
                                                                userParams = [startDate];
                                                                whereAdded = true;
                                                            } else if (endDate) {
                                                                usersQuery += ` WHERE fp.created_at <= ?`;
                                                                userParams = [endDate];
                                                                whereAdded = true;
                                                            }
                                                            
                                                            if (search) {
                                                                if (whereAdded) {
                                                                    usersQuery += ` AND (ft.title LIKE ? OR fp.content LIKE ?)`;
                                                                } else {
                                                                    usersQuery += ` WHERE (ft.title LIKE ? OR fp.content LIKE ?)`;
                                                                }
                                                                userParams.push(`%${search}%`, `%${search}%`);
                                                            }
                                                            
                                                            usersQuery += ` GROUP BY u.id
                                                            ORDER BY post_count DESC
                                                            LIMIT 10`;
                                                            
                                                            db.query(
                                                                usersQuery,
                                                                userParams,
                                                                (err, mostEngagedUsers) => {
                                                                    if (err) return res.status(500).json({ error: err.message });
                                                                    
                                                                    // Popular topics
                                                                    let topicsQuery = `SELECT ft.id, ft.title, u.name as creator_name,
                                                                        COUNT(fp.id) as post_count,
                                                                        (SELECT COUNT(DISTINCT user_id) FROM forum_posts WHERE topic_id = ft.id) as participants_count,
                                                                        ft.created_at,
                                                                        MAX(fp.created_at) as last_activity
                                                                    FROM forum_topics ft
                                                                    JOIN users u ON ft.created_by = u.id
                                                                    LEFT JOIN forum_posts fp ON ft.id = fp.topic_id`;
                                                                    
                                                                    whereAdded = false;
                                                                    let topicParams = [];
                                                                    
                                                                    if (startDate && endDate) {
                                                                        topicsQuery += ` WHERE ft.created_at BETWEEN ? AND ?`;
                                                                        topicParams = [startDate, endDate];
                                                                        whereAdded = true;
                                                                    } else if (startDate) {
                                                                        topicsQuery += ` WHERE ft.created_at >= ?`;
                                                                        topicParams = [startDate];
                                                                        whereAdded = true;
                                                                    } else if (endDate) {
                                                                        topicsQuery += ` WHERE ft.created_at <= ?`;
                                                                        topicParams = [endDate];
                                                                        whereAdded = true;
                                                                    }
                                                                    
                                                                    if (search) {
                                                                        if (whereAdded) {
                                                                            topicsQuery += ` AND (ft.title LIKE ? OR fp.content LIKE ?)`;
                                                                        } else {
                                                                            topicsQuery += ` WHERE (ft.title LIKE ? OR fp.content LIKE ?)`;
                                                                        }
                                                                        topicParams.push(`%${search}%`, `%${search}%`);
                                                                    }
                                                                    
                                                                    topicsQuery += ` GROUP BY ft.id
                                                                    ORDER BY post_count DESC
                                                                    LIMIT 10`;
                                                                    
                                                                    db.query(
                                                                        topicsQuery,
                                                                        topicParams,
                                                                        (err, popularTopics) => {
                                                                            if (err) return res.status(500).json({ error: err.message });
                                                                            
                                                                            res.json({
                                                                                forumActivity,
                                                                                successStories,
                                                                                mostEngagedUsers,
                                                                                popularTopics,
                                                                                metadata: {
                                                                                    dateRange: {
                                                                                        startDate: startDate || null,
                                                                                        endDate: endDate || null
                                                                                    },
                                                                                    search: search || null
                                                                                }
                                                                            });
                                                                        }
                                                                    );
                                                                }
                                                            );
                                                        }
                                                    );
                                                }
                                            );
                                        }
                                    );
                                }
                            );
                        }
                    );
                }
            );
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
};

// Helper function to create a date range filter SQL clause - now takes an additional parameter to add WHERE/AND
function getDateRangeFilter(startDate, endDate, fieldName, includeWhere = false) {
    const prefix = includeWhere ? 'WHERE' : 'AND';
    
    if (startDate && endDate) {
        return `${prefix} ${fieldName} BETWEEN ? AND ?`;
    } else if (startDate) {
        return `${prefix} ${fieldName} >= ?`;
    } else if (endDate) {
        return `${prefix} ${fieldName} <= ?`;
    }
    return '';
}

// Helper function to get parameters for date range
function getDateParams(startDate, endDate) {
    if (startDate && endDate) {
        return [startDate, endDate];
    } else if (startDate) {
        return [startDate];
    } else if (endDate) {
        return [endDate];
    }
    return [];
}

module.exports = reportsController;