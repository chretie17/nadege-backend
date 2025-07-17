const db = require('../config/db');

// Controller for Healthcare system reports with date range and search
const reportsController = {
    // 1. User Overview Report (Updated for healthcare system)
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
                            
                            // Get doctor profile completeness
                            db.query(
                                `SELECT id, username, name, email, role, specialization, experience, education,
                                    CASE
                                        WHEN specialization IS NOT NULL AND LENGTH(specialization) > 0 THEN 1
                                        ELSE 0
                                    END +
                                    CASE
                                        WHEN experience IS NOT NULL AND LENGTH(experience) > 10 THEN 1
                                        ELSE 0
                                    END +
                                    CASE
                                        WHEN education IS NOT NULL AND LENGTH(education) > 10 THEN 1
                                        ELSE 0
                                    END +
                                    CASE
                                        WHEN phone IS NOT NULL AND LENGTH(phone) > 0 THEN 1
                                        ELSE 0
                                    END AS completeness_score
                                FROM users
                                WHERE role = 'doctor' ${dateFilter ? 'AND' + dateFilter.substring(5) : ''} ${search ? 'AND ' + searchFilter.substring(6) : ''}
                                ORDER BY completeness_score DESC
                                LIMIT 10`,
                                [...getDateParams(startDate, endDate), ...searchParams],
                                (err, completeDoctorProfiles) => {
                                    if (err) return res.status(500).json({ error: err.message });
                                    
                                    // Get patient profile completeness
                                    db.query(
                                        `SELECT id, username, name, email, role, phone, date_of_birth,
                                            CASE
                                                WHEN phone IS NOT NULL AND LENGTH(phone) > 0 THEN 1
                                                ELSE 0
                                            END +
                                            CASE
                                                WHEN date_of_birth IS NOT NULL THEN 1
                                                ELSE 0
                                            END +
                                            CASE
                                                WHEN address IS NOT NULL AND LENGTH(address) > 5 THEN 1
                                                ELSE 0
                                            END AS completeness_score
                                        FROM users
                                        WHERE role = 'patient' ${dateFilter ? 'AND' + dateFilter.substring(5) : ''} ${search ? 'AND ' + searchFilter.substring(6) : ''}
                                        ORDER BY completeness_score DESC
                                        LIMIT 10`,
                                        [...getDateParams(startDate, endDate), ...searchParams],
                                        (err, completePatientProfiles) => {
                                            if (err) return res.status(500).json({ error: err.message });
                                            
                                            res.json({
                                                usersByRole,
                                                recentUsers,
                                                completeDoctorProfiles,
                                                completePatientProfiles,
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

    // 2. Appointments Analytics Report - FIXED
    getAppointmentsAnalytics: (req, res) => {
        try {
            // Extract date range and search query from request
            const { startDate, endDate, search } = req.query;
            
            const dateFilter = startDate || endDate ? getDateRangeFilter(startDate, endDate, 'appointments.created_at', true) : '';
            const searchFilter = search ? (dateFilter ? ' AND ' : ' WHERE ') + `(d.name LIKE ? OR d.specialization LIKE ? OR p.name LIKE ?)` : '';
            const searchParams = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];
            
            db.query(
                `SELECT 
                    COUNT(*) as total_appointments,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
                    COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_count,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
                    COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_count,
                    COUNT(CASE WHEN status = 'no_show' THEN 1 END) as no_show_count,
                    ROUND((COUNT(CASE WHEN status = 'completed' THEN 1 END) / COUNT(*)) * 100, 2) as completion_rate
                FROM appointments
                JOIN users d ON appointments.doctor_id = d.id
                JOIN users p ON appointments.patient_id = p.id
                ${dateFilter} ${searchFilter}`,
                [...getDateParams(startDate, endDate), ...searchParams],
                (err, appointmentStats) => {
                    if (err) return res.status(500).json({ error: err.message });
                    
                    db.query(
                        `SELECT d.name as doctor_name, d.specialization,
                            COUNT(*) as appointment_count,
                            COUNT(CASE WHEN appointments.status = 'completed' THEN 1 END) as completed_count,
                            ROUND((COUNT(CASE WHEN appointments.status = 'completed' THEN 1 END) / COUNT(*)) * 100, 2) as completion_rate
                        FROM appointments
                        JOIN users d ON appointments.doctor_id = d.id
                        JOIN users p ON appointments.patient_id = p.id
                        ${dateFilter} ${searchFilter}
                        GROUP BY d.id, d.name, d.specialization
                        ORDER BY appointment_count DESC
                        LIMIT 10`,
                        [...getDateParams(startDate, endDate), ...searchParams],
                        (err, doctorStats) => {
                            if (err) return res.status(500).json({ error: err.message });
                            
                            // FIX: Specify d.specialization explicitly
                            db.query(
                                `SELECT d.specialization, COUNT(*) as appointment_count
                                FROM appointments
                                JOIN users d ON appointments.doctor_id = d.id
                                JOIN users p ON appointments.patient_id = p.id
                                WHERE d.specialization IS NOT NULL ${dateFilter ? 'AND' + dateFilter.substring(5) : ''} ${search ? 'AND ' + searchFilter.substring(6) : ''}
                                GROUP BY d.specialization
                                ORDER BY appointment_count DESC
                                LIMIT 10`,
                                [...getDateParams(startDate, endDate), ...searchParams],
                                (err, specializationStats) => {
                                    if (err) return res.status(500).json({ error: err.message });
                                    
                                    // Get appointment trends by month
                                    db.query(
                                        `SELECT 
                                            DATE_FORMAT(appointment_date, '%Y-%m') as month,
                                            COUNT(*) as appointment_count,
                                            COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count
                                        FROM appointments
                                        JOIN users d ON appointments.doctor_id = d.id
                                        JOIN users p ON appointments.patient_id = p.id
                                        ${dateFilter} ${searchFilter}
                                        GROUP BY DATE_FORMAT(appointment_date, '%Y-%m')
                                        ORDER BY month DESC
                                        LIMIT 12`,
                                        [...getDateParams(startDate, endDate), ...searchParams],
                                        (err, appointmentTrends) => {
                                            if (err) return res.status(500).json({ error: err.message });
                                            
                                            res.json({
                                                appointmentStats: appointmentStats[0],
                                                doctorStats,
                                                specializationStats,
                                                appointmentTrends,
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

    // 3. Doctor Availability Report - FIXED
    getDoctorAvailabilityReport: (req, res) => {
        try {
            // Extract date range and search query from request
            const { startDate, endDate, search } = req.query;
            
            const searchFilter = search ? ` WHERE (d.name LIKE ? OR d.specialization LIKE ?)` : '';
            const searchParams = search ? [`%${search}%`, `%${search}%`] : [];
            
            db.query(
                `SELECT d.id, d.name, d.specialization, d.experience,
                    COUNT(da.id) as availability_slots,
                    COUNT(CASE WHEN da.is_available = 1 THEN 1 END) as available_slots,
                    COUNT(CASE WHEN da.is_available = 0 THEN 1 END) as unavailable_slots
                FROM users d
                LEFT JOIN doctor_availability da ON d.id = da.doctor_id
                WHERE d.role = 'doctor' ${search ? 'AND ' + searchFilter.substring(6) : ''}
                GROUP BY d.id, d.name, d.specialization, d.experience
                ORDER BY available_slots DESC`,
                [...searchParams],
                (err, doctorAvailability) => {
                    if (err) return res.status(500).json({ error: err.message });
                    
                    db.query(
                        `SELECT 
                            day_of_week,
                            COUNT(*) as total_slots,
                            COUNT(CASE WHEN is_available = 1 THEN 1 END) as available_slots
                        FROM doctor_availability da
                        JOIN users d ON da.doctor_id = d.id
                        ${search ? 'WHERE ' + searchFilter.substring(6) : ''}
                        GROUP BY day_of_week
                        ORDER BY FIELD(day_of_week, 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')`,
                        [...searchParams],
                        (err, availabilityByDay) => {
                            if (err) return res.status(500).json({ error: err.message });
                            
                            // FIX: Specify d.specialization explicitly
                            db.query(
                                `SELECT d.specialization,
                                    COUNT(DISTINCT d.id) as total_doctors,
                                    COUNT(CASE WHEN da.is_available = 1 THEN 1 END) as available_slots
                                FROM users d
                                LEFT JOIN doctor_availability da ON d.id = da.doctor_id
                                WHERE d.role = 'doctor' AND d.specialization IS NOT NULL ${search ? 'AND ' + searchFilter.substring(6) : ''}
                                GROUP BY d.specialization
                                ORDER BY available_slots DESC`,
                                [...searchParams],
                                (err, availabilityBySpecialization) => {
                                    if (err) return res.status(500).json({ error: err.message });
                                    
                                    res.json({
                                        doctorAvailability,
                                        availabilityByDay,
                                        availabilityBySpecialization,
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
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // 4. Community Engagement Metrics (Kept as is)
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
                                                            
                                                            usersQuery += ` GROUP BY u.id, u.name, u.username, u.role
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
                                                                    
                                                                    topicsQuery += ` GROUP BY ft.id, ft.title, u.name, ft.created_at
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