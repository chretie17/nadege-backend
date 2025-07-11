const db = require('../config/db');

// Dashboard controller with methods for fetching dashboard data
exports.getDashboardStats = async (req, res) => {
    try {
        // Execute all queries in parallel for better performance
        const [
            userStats,
            jobStats,
            applicationStats,
            communityStats
        ] = await Promise.all([
            getUserStats(),
            getJobStats(),
            getApplicationStats(),
            getCommunityStats()
        ]);

        // Return all dashboard data
        res.json({
            userStats,
            jobStats,
            applicationStats,
            communityStats
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ error: error.message });
    }
};

// Get all data for the skills distribution chart
exports.getSkillsDistribution = async (req, res) => {
    try {
        const skillsData = await getSkillsDistributionData();
        res.json(skillsData);
    } catch (error) {
        console.error('Error fetching skills distribution:', error);
        res.status(500).json({ error: error.message });
    }
};

// Get job market trends data
exports.getJobMarketTrends = async (req, res) => {
    try {
        const jobTrendsData = await getJobMarketTrendsData();
        res.json(jobTrendsData);
    } catch (error) {
        console.error('Error fetching job market trends:', error);
        res.status(500).json({ error: error.message });
    }
};

// Get application status funnel data
exports.getApplicationFunnel = async (req, res) => {
    try {
        const applicationFunnelData = await getApplicationFunnelData();
        res.json(applicationFunnelData);
    } catch (error) {
        console.error('Error fetching application funnel data:', error);
        res.status(500).json({ error: error.message });
    }
};

// Helper function to get user statistics
const getUserStats = () => {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT 
                COUNT(*) as totalUsers,
                SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as jobSeekers,
                SUM(CASE WHEN role = 'employer' THEN 1 ELSE 0 END) as employers,
                SUM(CASE WHEN created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as newUsersLast30Days
            FROM 
                users
        `;
        
        db.query(query, (err, results) => {
            if (err) {
                reject(err);
            } else {
                resolve(results[0]);
            }
        });
    });
};

// Helper function to get job statistics
const getJobStats = () => {
    return new Promise((resolve, reject) => {
        const currentDate = new Date().toISOString().split('T')[0];
        
        const query = `
            SELECT 
                COUNT(*) as totalJobs,
                SUM(CASE WHEN application_deadline >= ? OR application_deadline IS NULL THEN 1 ELSE 0 END) as activeJobs,
                COUNT(DISTINCT location) as uniqueLocations,
                COUNT(DISTINCT category) as jobCategories
            FROM 
                jobs
        `;
        
        db.query(query, [currentDate], (err, results) => {
            if (err) {
                reject(err);
            } else {
                resolve(results[0]);
            }
        });
    });
};

// Helper function to get application statistics
const getApplicationStats = () => {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT 
                COUNT(*) as totalApplications,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pendingApplications,
                SUM(CASE WHEN status = 'interviewing' THEN 1 ELSE 0 END) as interviewingApplications,
                SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as acceptedApplications,
                SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejectedApplications,
                ROUND((SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) / COUNT(*)) * 100, 1) as successRate
            FROM 
                job_applications
        `;
        
        db.query(query, (err, results) => {
            if (err) {
                reject(err);
            } else {
                resolve(results[0]);
            }
        });
    });
};

// Helper function to get community statistics
const getCommunityStats = () => {
    return new Promise((resolve, reject) => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const dateStr = thirtyDaysAgo.toISOString().split('T')[0];
        
        const query = `
            SELECT 
                (SELECT COUNT(*) FROM forum_topics) as totalTopics,
                (SELECT COUNT(*) FROM forum_posts) as totalPosts,
                (SELECT COUNT(*) FROM forum_topics WHERE created_at >= ?) as newTopicsLast30Days,
                (SELECT COUNT(*) FROM forum_posts WHERE created_at >= ?) as newPostsLast30Days,
                (SELECT COUNT(*) FROM success_stories) as totalSuccessStories,
                (SELECT COUNT(*) FROM success_stories WHERE is_approved = true) as approvedSuccessStories
            FROM 
                dual
        `;
        
        db.query(query, [dateStr, dateStr], (err, results) => {
            if (err) {
                reject(err);
            } else {
                resolve(results[0]);
            }
        });
    });
};

// Helper function to get skills distribution data
const getSkillsDistributionData = () => {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT 
                s.name as skillName,
                sc.name as categoryName,
                COUNT(us.user_id) as userCount
            FROM 
                skills s
            JOIN 
                skills_categories sc ON s.category_id = sc.id
            LEFT JOIN 
                user_skills us ON s.id = us.skill_id
            GROUP BY 
                s.id
            ORDER BY 
                userCount DESC
            LIMIT 10
        `;
        
        db.query(query, (err, results) => {
            if (err) {
                reject(err);
            } else {
                resolve(results);
            }
        });
    });
};

// Helper function to get job market trends data (last 6 months)
const getJobMarketTrendsData = () => {
    return new Promise((resolve, reject) => {
        // Generate the last 6 months
        const months = [];
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const month = d.toLocaleString('default', { month: 'short' });
            const year = d.getFullYear();
            months.push({ 
                month: `${month} ${year}`, 
                startDate: new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0],
                endDate: new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0]
            });
        }
        
        // Get job count by category for each month
        const queries = months.map(monthData => {
            return new Promise((resolve, reject) => {
                const query = `
                    SELECT 
                        category,
                        COUNT(*) as jobCount
                    FROM 
                        jobs
                    WHERE 
                        created_at BETWEEN ? AND ?
                    GROUP BY 
                        category
                `;
                
                db.query(query, [monthData.startDate, monthData.endDate], (err, results) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({
                            month: monthData.month,
                            categories: results
                        });
                    }
                });
            });
        });
        
        Promise.all(queries)
            .then(results => {
                // Get unique categories
                const allCategories = new Set();
                results.forEach(monthData => {
                    monthData.categories.forEach(cat => {
                        if (cat.category) allCategories.add(cat.category);
                    });
                });
                
                // Format data for the chart
                const formattedData = results.map(monthData => {
                    const dataPoint = { month: monthData.month };
                    
                    // Initialize all categories with 0
                    Array.from(allCategories).forEach(category => {
                        dataPoint[category] = 0;
                    });
                    
                    // Fill in actual values
                    monthData.categories.forEach(cat => {
                        if (cat.category) dataPoint[cat.category] = cat.jobCount;
                    });
                    
                    return dataPoint;
                });
                
                resolve({
                    categories: Array.from(allCategories),
                    data: formattedData
                });
            })
            .catch(reject);
    });
};

// Helper function to get application funnel data
const getApplicationFunnelData = () => {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT 
                'Total Applications' as stage,
                COUNT(*) as count,
                1 as order_num
            FROM 
                job_applications
            UNION
            SELECT 
                'Reviewed' as stage,
                COUNT(*) as count,
                2 as order_num
            FROM 
                job_applications
            WHERE 
                status != 'pending'
            UNION
            SELECT 
                'Interviewing' as stage,
                COUNT(*) as count,
                3 as order_num
            FROM 
                job_applications
            WHERE 
                status = 'interviewing'
            UNION
            SELECT 
                'Accepted' as stage,
                COUNT(*) as count,
                4 as order_num
            FROM 
                job_applications
            WHERE 
                status = 'accepted'
            ORDER BY 
                order_num
        `;
        
        db.query(query, (err, results) => {
            if (err) {
                reject(err);
            } else {
                resolve(results);
            }
        });
    });
};