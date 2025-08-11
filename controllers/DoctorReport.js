const db = require('../config/db');

// Get doctor's appointment statistics
// Get doctor's appointment statistics - FIXED DATE FILTERING
exports.getDoctorStats = (req, res) => {
    const { doctor_id } = req.params;
    const { period = 'month' } = req.query; // 'today', 'week', 'month', 'year', 'all'
    
    let dateFilter = '';
    let periodLabel = '';
    
    switch (period) {
        case 'today':
            dateFilter = 'AND DATE(a.appointment_date) = CURDATE()';
            periodLabel = 'Today';
            break;
        case 'week':
            dateFilter = 'AND a.appointment_date >= DATE_SUB(CURDATE(), INTERVAL 1 WEEK) AND a.appointment_date <= CURDATE()';
            periodLabel = 'This Week';
            break;
        case 'month':
            dateFilter = 'AND a.appointment_date >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH) AND a.appointment_date <= CURDATE()';
            periodLabel = 'This Month';
            break;
        case 'year':
            dateFilter = 'AND a.appointment_date >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR) AND a.appointment_date <= CURDATE()';
            periodLabel = 'This Year';
            break;
        case 'all':
            dateFilter = '';
            periodLabel = 'All Time';
            break;
        default:
            dateFilter = 'AND a.appointment_date >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH) AND a.appointment_date <= CURDATE()';
            periodLabel = 'This Month';
    }
    
    const query = `
        SELECT 
            COUNT(*) as total_appointments,
            COUNT(CASE WHEN a.status = 'pending' THEN 1 END) as pending_appointments,
            COUNT(CASE WHEN a.status = 'confirmed' THEN 1 END) as confirmed_appointments,
            COUNT(CASE WHEN a.status = 'completed' THEN 1 END) as completed_appointments,
            COUNT(CASE WHEN a.status = 'cancelled' THEN 1 END) as cancelled_appointments,
            COUNT(CASE WHEN a.status = 'no_show' THEN 1 END) as no_show_appointments,
            ROUND(
                CASE 
                    WHEN COUNT(*) > 0 
                    THEN (COUNT(CASE WHEN a.status = 'completed' THEN 1 END) * 100.0 / COUNT(*)) 
                    ELSE 0 
                END, 2
            ) as completion_rate,
            ROUND(
                CASE 
                    WHEN COUNT(*) > 0 
                    THEN (COUNT(CASE WHEN a.status = 'cancelled' THEN 1 END) * 100.0 / COUNT(*)) 
                    ELSE 0 
                END, 2
            ) as cancellation_rate,
            COUNT(DISTINCT a.patient_id) as unique_patients,
            MIN(a.appointment_date) as period_start,
            MAX(a.appointment_date) as period_end
        FROM 
            appointments a
        WHERE 
            a.doctor_id = ? ${dateFilter}
    `;
    
    db.query(query, [doctor_id], (err, results) => {
        if (err) {
            console.error('Database error in getDoctorStats:', err);
            return res.status(500).json({ error: err.message });
        }
        
        const stats = results[0];
        stats.period = periodLabel;
        stats.completion_rate = stats.completion_rate || 0;
        stats.cancellation_rate = stats.cancellation_rate || 0;
        
        // Debug information
        console.log(`Stats for doctor ${doctor_id}, period ${period}:`, stats);
        
        res.json(stats);
    });
};

// Get doctor's appointment trends (monthly data for charts) - FIXED
// Get doctor's appointment trends (monthly data for charts) - UPDATED to support date ranges
exports.getDoctorTrends = (req, res) => {
    const { doctor_id } = req.params;
    const { months = 6, start_date, end_date, period = 'month' } = req.query;
    
    let dateFilter = '';
    let groupByClause = '';
    let orderByClause = '';
    let dateFormatClause = '';
    const params = [doctor_id];
    
    // Determine date filtering and grouping based on parameters
    if (start_date && end_date) {
        // Use specific date range
        dateFilter = 'AND a.appointment_date >= ? AND a.appointment_date <= ?';
        params.push(start_date, end_date);
        
        // Calculate period between dates to determine appropriate grouping
        const startDateObj = new Date(start_date);
        const endDateObj = new Date(end_date);
        const daysDifference = Math.ceil((endDateObj - startDateObj) / (1000 * 60 * 60 * 24));
        
        if (daysDifference <= 31) {
            // Daily grouping for periods <= 1 month
          dateFormatClause = `
    DATE(a.appointment_date) as period_key,
    DATE_FORMAT(a.appointment_date, '%M %d, %Y') as period_name,
    DATE_FORMAT(a.appointment_date, '%Y-%m-%d') as period_sort
`;
groupByClause = 'DATE(a.appointment_date), DATE_FORMAT(a.appointment_date, \'%M %d, %Y\'), DATE_FORMAT(a.appointment_date, \'%Y-%m-%d\')';
            orderByClause = 'period_sort ASC';
        } else if (daysDifference <= 93) {
            // Weekly grouping for periods <= 3 months
         dateFormatClause = `
    CONCAT(YEAR(a.appointment_date), '-', WEEK(a.appointment_date, 1)) as period_key,
    CONCAT('Week ', WEEK(a.appointment_date, 1), ', ', YEAR(a.appointment_date)) as period_name,
    CONCAT(YEAR(a.appointment_date), '-', LPAD(WEEK(a.appointment_date, 1), 2, '0')) as period_sort
`;
groupByClause = 'YEAR(a.appointment_date), WEEK(a.appointment_date, 1)';
            orderByClause = 'period_sort ASC';
        } else {
            // Monthly grouping for longer periods
            dateFormatClause = `
                DATE_FORMAT(a.appointment_date, '%Y-%m') as period_key,
                DATE_FORMAT(a.appointment_date, '%M %Y') as period_name,
                DATE_FORMAT(a.appointment_date, '%Y-%m') as period_sort
            `;
            groupByClause = 'DATE_FORMAT(a.appointment_date, \'%Y-%m\')';
            orderByClause = 'period_sort ASC';
        }
    } else {
        // Use months parameter (existing functionality)
        dateFilter = 'AND a.appointment_date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH) AND a.appointment_date <= CURDATE()';
        params.push(parseInt(months));
        
        // Default to monthly grouping
       dateFormatClause = `
    DATE_FORMAT(a.appointment_date, '%Y-%m') as period_key,
    DATE_FORMAT(a.appointment_date, '%M %Y') as period_name,
    DATE_FORMAT(a.appointment_date, '%Y-%m') as period_sort
`;
groupByClause = 'DATE_FORMAT(a.appointment_date, \'%Y-%m\'), DATE_FORMAT(a.appointment_date, \'%M %Y\')';
        orderByClause = 'period_sort ASC';
    }
    
    const query = `
        SELECT 
            ${dateFormatClause},
            COUNT(*) as total_appointments,
            COUNT(CASE WHEN a.status = 'completed' THEN 1 END) as completed_appointments,
            COUNT(CASE WHEN a.status = 'confirmed' THEN 1 END) as confirmed_appointments,
            COUNT(CASE WHEN a.status = 'pending' THEN 1 END) as pending_appointments,
            COUNT(CASE WHEN a.status = 'cancelled' THEN 1 END) as cancelled_appointments,
            COUNT(CASE WHEN a.status = 'no_show' THEN 1 END) as no_show_appointments,
            COUNT(DISTINCT a.patient_id) as unique_patients,
            ROUND(
                CASE 
                    WHEN COUNT(*) > 0 
                    THEN (COUNT(CASE WHEN a.status = 'completed' THEN 1 END) * 100.0 / COUNT(*)) 
                    ELSE 0 
                END, 2
            ) as completion_rate,
            ROUND(
                CASE 
                    WHEN COUNT(*) > 0 
                    THEN (COUNT(CASE WHEN a.status = 'cancelled' THEN 1 END) * 100.0 / COUNT(*)) 
                    ELSE 0 
                END, 2
            ) as cancellation_rate,
            ROUND(
                CASE 
                    WHEN COUNT(*) > 0 
                    THEN (COUNT(CASE WHEN a.status = 'no_show' THEN 1 END) * 100.0 / COUNT(*)) 
                    ELSE 0 
                END, 2
            ) as no_show_rate
        FROM 
            appointments a
        WHERE 
            a.doctor_id = ?
            ${dateFilter}
        GROUP BY 
            ${groupByClause}
        ORDER BY 
            ${orderByClause}
    `;
    
    db.query(query, params, (err, results) => {
        if (err) {
            console.error('Database error in getDoctorTrends:', err);
            return res.status(500).json({ error: err.message });
        }
        
        // Add metadata about the query
        const responseData = {
            trends: results,
            meta: {
                total_periods: results.length,
                date_range: start_date && end_date ? {
                    start_date,
                    end_date
                } : {
                    months_back: parseInt(months)
                },
                grouping_type: start_date && end_date ? 
                    (Math.ceil((new Date(end_date) - new Date(start_date)) / (1000 * 60 * 60 * 24)) <= 31 ? 'daily' :
                     Math.ceil((new Date(end_date) - new Date(start_date)) / (1000 * 60 * 60 * 24)) <= 93 ? 'weekly' : 'monthly') : 
                    'monthly'
            }
        };
        
        console.log(`Trends for doctor ${doctor_id}:`, responseData.meta);
        res.json(responseData);
    });
};


// Get doctor's daily schedule report
exports.getDailyScheduleReport = (req, res) => {
    const { doctor_id } = req.params;
    const { date } = req.query;
    
    // If no date provided, use today
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    const query = `
        SELECT 
            a.id,
            a.appointment_time,
            a.status,
            a.reason,
            a.notes,
            p.name as patient_name,
            p.email as patient_email,
            p.phone as patient_phone,
            p.date_of_birth as patient_dob,
            TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) as patient_age
        FROM 
            appointments a
        JOIN 
            users p ON a.patient_id = p.id
        WHERE 
            a.doctor_id = ?
            AND a.appointment_date = ?
        ORDER BY 
            a.appointment_time ASC
    `;
    
    db.query(query, [doctor_id, targetDate], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // Format the results with time slots
        const formattedResults = results.map(appointment => ({
            ...appointment,
            appointment_time_formatted: formatTime(appointment.appointment_time),
            patient_age: appointment.patient_age || 'N/A'
        }));
        
        res.json({
            date: targetDate,
            appointments: formattedResults,
            total_appointments: results.length,
            completed: results.filter(a => a.status === 'completed').length,
            pending: results.filter(a => a.status === 'pending').length,
            cancelled: results.filter(a => a.status === 'cancelled').length
        });
    });
};

// Get doctor's patient demographics
// Get doctor's patient demographics - FIXED VERSION
exports.getPatientDemographics = (req, res) => {
    const { doctor_id } = req.params;
    
    const query = `
        SELECT 
            COUNT(DISTINCT p.id) as total_unique_patients,
            COUNT(CASE WHEN TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) < 18 THEN 1 END) as pediatric_patients,
            COUNT(CASE WHEN TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) BETWEEN 18 AND 65 THEN 1 END) as adult_patients,
            COUNT(CASE WHEN TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) > 65 THEN 1 END) as senior_patients,
            COUNT(CASE WHEN p.gender = 'male' THEN 1 END) as male_patients,
            COUNT(CASE WHEN p.gender = 'female' THEN 1 END) as female_patients,
            COUNT(CASE WHEN p.gender = 'other' OR p.gender IS NULL THEN 1 END) as other_gender_patients,
            ROUND(AVG(TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE())), 1) as average_age
        FROM 
            appointments a
        JOIN 
            users p ON a.patient_id = p.id
        WHERE 
            a.doctor_id = ?
            AND p.date_of_birth IS NOT NULL
        GROUP BY 
            a.doctor_id
    `;
    
    db.query(query, [doctor_id], (err, results) => {
        if (err) {
            // Handle case where gender column doesn't exist yet
            if (err.message.includes("Unknown column 'p.gender'")) {
                const fallbackQuery = `
                    SELECT 
                        COUNT(DISTINCT p.id) as total_unique_patients,
                        COUNT(CASE WHEN TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) < 18 THEN 1 END) as pediatric_patients,
                        COUNT(CASE WHEN TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) BETWEEN 18 AND 65 THEN 1 END) as adult_patients,
                        COUNT(CASE WHEN TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) > 65 THEN 1 END) as senior_patients,
                        0 as male_patients,
                        0 as female_patients,
                        COUNT(DISTINCT p.id) as other_gender_patients,
                        ROUND(AVG(TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE())), 1) as average_age
                    FROM 
                        appointments a
                    JOIN 
                        users p ON a.patient_id = p.id
                    WHERE 
                        a.doctor_id = ?
                        AND p.date_of_birth IS NOT NULL
                    GROUP BY 
                        a.doctor_id
                `;
                
                db.query(fallbackQuery, [doctor_id], (fallbackErr, fallbackResults) => {
                    if (fallbackErr) return res.status(500).json({ error: fallbackErr.message });
                    
                    const demographics = fallbackResults[0] || {
                        total_unique_patients: 0,
                        pediatric_patients: 0,
                        adult_patients: 0,
                        senior_patients: 0,
                        male_patients: 0,
                        female_patients: 0,
                        other_gender_patients: 0,
                        average_age: 0,
                        note: "Gender column not available. Please run database migration."
                    };
                    
                    res.json(demographics);
                });
                return;
            }
            return res.status(500).json({ error: err.message });
        }
        
        const demographics = results[0] || {
            total_unique_patients: 0,
            pediatric_patients: 0,
            adult_patients: 0,
            senior_patients: 0,
            male_patients: 0,
            female_patients: 0,
            other_gender_patients: 0,
            average_age: 0
        };
        
        res.json(demographics);
    });
};

// Alternative query if the above still returns zeros
// This query gets ALL patients who have ANY appointments with the doctor
exports.getPatientDemographicsAlternative = (req, res) => {
    const { doctor_id } = req.params;
    
    // First, let's check if there are any appointments for this doctor
    const checkQuery = `
        SELECT COUNT(*) as appointment_count 
        FROM appointments 
        WHERE doctor_id = ?
    `;
    
    db.query(checkQuery, [doctor_id], (checkErr, checkResults) => {
        if (checkErr) return res.status(500).json({ error: checkErr.message });
        
        const appointmentCount = checkResults[0].appointment_count;
        
        if (appointmentCount === 0) {
            return res.json({
                total_unique_patients: 0,
                pediatric_patients: 0,
                adult_patients: 0,
                senior_patients: 0,
                male_patients: 0,
                female_patients: 0,
                other_gender_patients: 0,
                average_age: 0,
                note: "No appointments found for this doctor"
            });
        }
        
        // If there are appointments, get the demographics
        const query = `
            SELECT 
                COUNT(DISTINCT p.id) as total_unique_patients,
                COUNT(CASE 
                    WHEN p.date_of_birth IS NOT NULL 
                    AND TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) < 18 
                    THEN 1 
                END) as pediatric_patients,
                COUNT(CASE 
                    WHEN p.date_of_birth IS NOT NULL 
                    AND TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) BETWEEN 18 AND 65 
                    THEN 1 
                END) as adult_patients,
                COUNT(CASE 
                    WHEN p.date_of_birth IS NOT NULL 
                    AND TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) > 65 
                    THEN 1 
                END) as senior_patients,
                COUNT(CASE WHEN p.gender = 'male' THEN 1 END) as male_patients,
                COUNT(CASE WHEN p.gender = 'female' THEN 1 END) as female_patients,
                COUNT(CASE WHEN p.gender = 'other' OR p.gender IS NULL THEN 1 END) as other_gender_patients,
                ROUND(AVG(CASE 
                    WHEN p.date_of_birth IS NOT NULL 
                    THEN TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) 
                END), 1) as average_age
            FROM 
                (SELECT DISTINCT patient_id FROM appointments WHERE doctor_id = ?) as unique_appointments
            JOIN 
                users p ON unique_appointments.patient_id = p.id
        `;
        
        db.query(query, [doctor_id], (err, results) => {
            if (err) {
                // Handle case where gender column doesn't exist
                if (err.message.includes("Unknown column 'p.gender'")) {
                    const fallbackQuery = `
                        SELECT 
                            COUNT(DISTINCT p.id) as total_unique_patients,
                            COUNT(CASE 
                                WHEN p.date_of_birth IS NOT NULL 
                                AND TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) < 18 
                                THEN 1 
                            END) as pediatric_patients,
                            COUNT(CASE 
                                WHEN p.date_of_birth IS NOT NULL 
                                AND TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) BETWEEN 18 AND 65 
                                THEN 1 
                            END) as adult_patients,
                            COUNT(CASE 
                                WHEN p.date_of_birth IS NOT NULL 
                                AND TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) > 65 
                                THEN 1 
                            END) as senior_patients,
                            0 as male_patients,
                            0 as female_patients,
                            COUNT(DISTINCT p.id) as other_gender_patients,
                            ROUND(AVG(CASE 
                                WHEN p.date_of_birth IS NOT NULL 
                                THEN TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) 
                            END), 1) as average_age
                        FROM 
                            (SELECT DISTINCT patient_id FROM appointments WHERE doctor_id = ?) as unique_appointments
                        JOIN 
                            users p ON unique_appointments.patient_id = p.id
                    `;
                    
                    db.query(fallbackQuery, [doctor_id], (fallbackErr, fallbackResults) => {
                        if (fallbackErr) return res.status(500).json({ error: fallbackErr.message });
                        
                        const demographics = fallbackResults[0] || {
                            total_unique_patients: 0,
                            pediatric_patients: 0,
                            adult_patients: 0,
                            senior_patients: 0,
                            male_patients: 0,
                            female_patients: 0,
                            other_gender_patients: 0,
                            average_age: 0
                        };
                        
                        res.json(demographics);
                    });
                    return;
                }
                return res.status(500).json({ error: err.message });
            }
            
            const demographics = results[0] || {
                total_unique_patients: 0,
                pediatric_patients: 0,
                adult_patients: 0,
                senior_patients: 0,
                male_patients: 0,
                female_patients: 0,
                other_gender_patients: 0,
                average_age: 0
            };
            
            res.json(demographics);
        });
    });
};

// Get doctor's most common appointment reasons
exports.getCommonReasons = (req, res) => {
    const { doctor_id } = req.params;
    const { limit = 10 } = req.query;
    
    const query = `
        SELECT 
            a.reason,
            COUNT(*) as frequency,
            ROUND((COUNT(*) * 100.0 / (
                SELECT COUNT(*) 
                FROM appointments 
                WHERE doctor_id = ? AND reason IS NOT NULL AND reason != ''
            )), 2) as percentage
        FROM 
            appointments a
        WHERE 
            a.doctor_id = ?
            AND a.reason IS NOT NULL 
            AND a.reason != ''
        GROUP BY 
            a.reason
        ORDER BY 
            frequency DESC
        LIMIT ?
    `;
    
    db.query(query, [doctor_id, doctor_id, parseInt(limit)], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
};

// Get doctor's appointment patterns by day of week
exports.getAppointmentPatterns = (req, res) => {
    const { doctor_id } = req.params;
    
    const query = `
        SELECT 
            DAYNAME(a.appointment_date) as day_of_week,
            DAYOFWEEK(a.appointment_date) as day_number,
            COUNT(*) as total_appointments,
            COUNT(CASE WHEN a.status = 'completed' THEN 1 END) as completed_appointments,
            COUNT(CASE WHEN a.status = 'cancelled' THEN 1 END) as cancelled_appointments,
            COUNT(CASE WHEN a.status = 'no_show' THEN 1 END) as no_show_appointments,
            ROUND(AVG(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) * 100, 2) as completion_rate
        FROM 
            appointments a
        WHERE 
            a.doctor_id = ?
            AND a.appointment_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
        GROUP BY 
            DAYNAME(a.appointment_date), DAYOFWEEK(a.appointment_date)
        ORDER BY 
            day_number
    `;
    
    db.query(query, [doctor_id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
};

// Get doctor's peak hours analysis
exports.getPeakHours = (req, res) => {
    const { doctor_id } = req.params;
    
    const query = `
        SELECT 
            HOUR(a.appointment_time) as hour,
            COUNT(*) as appointment_count,
            COUNT(CASE WHEN a.status = 'completed' THEN 1 END) as completed_count,
            COUNT(CASE WHEN a.status = 'no_show' THEN 1 END) as no_show_count,
            ROUND((COUNT(CASE WHEN a.status = 'completed' THEN 1 END) / COUNT(*)) * 100, 2) as completion_rate
        FROM 
            appointments a
        WHERE 
            a.doctor_id = ?
            AND a.appointment_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
        GROUP BY 
            HOUR(a.appointment_time)
        ORDER BY 
            hour ASC
    `;
    
    db.query(query, [doctor_id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // Format hours for better display
        const formattedResults = results.map(row => ({
            ...row,
            hour_display: formatHour(row.hour),
            completion_rate: row.completion_rate || 0
        }));
        
        res.json(formattedResults);
    });
};

// Get doctor's recent patients
exports.getRecentPatients = (req, res) => {
    const { doctor_id } = req.params;
    const { limit = 20 } = req.query;
    
    const query = `
        SELECT DISTINCT
            p.id,
            p.name as patient_name,
            p.email,
            p.phone,
            p.date_of_birth,
            TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) as age,
            p.gender,
            MAX(a.appointment_date) as last_visit,
            COUNT(a.id) as total_visits,
            COUNT(CASE WHEN a.status = 'completed' THEN 1 END) as completed_visits,
            MAX(CASE WHEN a.status = 'completed' THEN a.notes END) as last_notes
        FROM 
            appointments a
        JOIN 
            users p ON a.patient_id = p.id
        WHERE 
            a.doctor_id = ?
        GROUP BY 
            p.id, p.name, p.email, p.phone, p.date_of_birth, p.gender
        ORDER BY 
            last_visit DESC
        LIMIT ?
    `;
    
    db.query(query, [doctor_id, parseInt(limit)], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const formattedResults = results.map(patient => ({
            ...patient,
            age: patient.age || 'N/A',
            last_visit_formatted: formatDate(patient.last_visit)
        }));
        
        res.json(formattedResults);
    });
};

// Get comprehensive doctor performance report
exports.getPerformanceReport = (req, res) => {
    const { doctor_id } = req.params;
    const { start_date, end_date } = req.query;
    
    let dateFilter = '';
    const params = [doctor_id];
    
    if (start_date && end_date) {
        dateFilter = 'AND a.appointment_date BETWEEN ? AND ?';
        params.push(start_date, end_date);
    } else {
        dateFilter = 'AND a.appointment_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
    }
    
    const query = `
        SELECT 
            COUNT(*) as total_appointments,
            COUNT(CASE WHEN a.status = 'completed' THEN 1 END) as completed_appointments,
            COUNT(CASE WHEN a.status = 'cancelled' THEN 1 END) as cancelled_appointments,
            COUNT(CASE WHEN a.status = 'no_show' THEN 1 END) as no_show_appointments,
            COUNT(DISTINCT a.patient_id) as unique_patients,
            COUNT(DISTINCT DATE(a.appointment_date)) as working_days,
            ROUND(COUNT(*) / COUNT(DISTINCT DATE(a.appointment_date)), 2) as avg_appointments_per_day,
            ROUND((COUNT(CASE WHEN a.status = 'completed' THEN 1 END) / COUNT(*)) * 100, 2) as completion_rate,
            ROUND((COUNT(CASE WHEN a.status = 'cancelled' THEN 1 END) / COUNT(*)) * 100, 2) as cancellation_rate,
            ROUND((COUNT(CASE WHEN a.status = 'no_show' THEN 1 END) / COUNT(*)) * 100, 2) as no_show_rate,
            MIN(a.appointment_date) as period_start,
            MAX(a.appointment_date) as period_end
        FROM 
            appointments a
        WHERE 
            a.doctor_id = ? ${dateFilter}
    `;
    
    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const report = results[0];
        report.completion_rate = report.completion_rate || 0;
        report.cancellation_rate = report.cancellation_rate || 0;
        report.no_show_rate = report.no_show_rate || 0;
        report.avg_appointments_per_day = report.avg_appointments_per_day || 0;
        report.period_start_formatted = formatDate(report.period_start);
        report.period_end_formatted = formatDate(report.period_end);
        
        res.json(report);
    });
};

// Helper functions
function formatTime(timeString) {
    if (!timeString) return '';
    
    const time = new Date(`2000-01-01 ${timeString}`);
    return time.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

function formatHour(hour) {
    const time = new Date();
    time.setHours(hour, 0, 0, 0);
    return time.toLocaleTimeString('en-US', {
        hour: 'numeric',
        hour12: true
    });
}

function formatDate(dateString) {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}