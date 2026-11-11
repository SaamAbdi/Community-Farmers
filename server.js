
require("dotenv").config();

const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const cookieParser = require("cookie-parser");
const app = express();

const PUBLIC_DIR = path.join(__dirname, "public");
const PRIVATE_DIR = path.join(__dirname, "private");
const UPLOAD_DIR = path.join(PUBLIC_DIR, "uploads");
const IMAGE_DIR = path.join(PUBLIC_DIR, "images");

// Ensure directories exist
[PUBLIC_DIR, PRIVATE_DIR, UPLOAD_DIR, IMAGE_DIR].forEach(dir => {
    fs.mkdirSync(dir, { recursive: true });
});

// CORS
app.use(cors({
    origin: process.env.CLIENT_ORIGIN || true,
    credentials: true
}));
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Public files only
app.use(express.static(PUBLIC_DIR));

// Uploaded images
app.use("/uploads", express.static(UPLOAD_DIR));
app.use("/images", express.static(IMAGE_DIR));
/* =====================================================
   COMMUNITY POST IMAGE UPLOAD
===================================================== */

const communityUploadDir = path.join(
    UPLOAD_DIR,
    "community-posts"
);

fs.mkdirSync(communityUploadDir, {
    recursive: true
});

const communityStorage = multer.diskStorage({

    destination: function(req, file, cb) {

        cb(null, communityUploadDir);

    },

    filename: function(req, file, cb) {

        const extension = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp",
            "image/gif": ".gif"
        }[file.mimetype];

        cb(
            null,
            crypto.randomBytes(16).toString("hex") + extension
        );

    }

});

const communityUpload = multer({

    storage: communityStorage,

    limits: {
        fileSize: 3 * 1024 * 1024
    },

    fileFilter: function(req, file, cb) {

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif"
        ];

        if (!allowedTypes.includes(file.mimetype)) {

            return cb(
                new Error("Only JPG, PNG, WEBP and GIF images are allowed.")
            );

        }

        cb(null, true);

    }

});
/* =====================================================
   FARMER PROFILE PHOTO UPLOAD
===================================================== */

const farmerProfileUploadDir = path.join(
    UPLOAD_DIR,
    "farmer-profiles"
);

fs.mkdirSync(farmerProfileUploadDir, {
    recursive: true
});


const farmerProfileStorage = multer.diskStorage({

    destination: function(req, file, cb) {

        cb(null, farmerProfileUploadDir);

    },

    filename: function(req, file, cb) {

        const extension = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp",
            "image/gif": ".gif"
        }[file.mimetype];

        cb(
            null,
            crypto.randomBytes(16).toString("hex") + extension
        );

    }

});


const farmerProfileUpload = multer({

    storage: farmerProfileStorage,

    limits: {
        fileSize: 3 * 1024 * 1024
    },

    fileFilter: function(req, file, cb) {

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif"
        ];

        if (!allowedTypes.includes(file.mimetype)) {

            return cb(
                new Error(
                    "Only JPG, PNG, WEBP and GIF images are allowed."
                )
            );

        }

        cb(null, true);

    }

});
// PostgreSQL - Render
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === "true"
        ? { rejectUnauthorized: false }
        : false,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 10
});

// Security configuration
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);
const JWT_SECRET = process.env.JWT_SECRET;

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing from .env");
}
// =========================================
// RENDER DATABASE CONNECTION TEST
// =========================================

async function testDatabaseConnection() {
    try {
        const result = await pool.query(
            "SELECT NOW() AS database_time"
        );

        console.log("=================================");
        console.log("RENDER POSTGRESQL CONNECTED");
        console.log("Database time:", result.rows[0].database_time);
        console.log("=================================");

    } catch (error) {
        console.error("=================================");
        console.error("RENDER DATABASE CONNECTION FAILED");
        console.error(error.message);
        console.error("=================================");
    }
}

testDatabaseConnection();
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters.");
}




// =====================================================
// FARMER ACCOUNT ACTIVATION
// =====================================================

app.get("/community-farmers-account", (req, res) => {
    res.sendFile(
        path.join(PUBLIC_DIR, "community-farmers-account.html")
    );
});


// =====================================================
// FARMER LOGIN
// =====================================================

app.get("/community-login", (req, res) => {
    res.sendFile(
        path.join(PRIVATE_DIR, "community-login.html")
    );
});


// =====================================================
// FARMER PAGE AUTHENTICATION
// =====================================================

function requireFarmerPage(req, res, next) {

    const token = getToken(req);

    if (!token) {
        return res.redirect("/community-login");
    }

    // Check whether the session token is valid.
    try {
        jwt.verify(token, JWT_SECRET);
    } catch (error) {

        res.clearCookie("farmerToken", {
            path: "/"
        });

        return res.redirect("/community-login");
    }

    // Verify farmer identity and account status.
    requireFarmer(req, res, next);
}


// =====================================================
// COMMUNITY FARMERS HOMEPAGE — PROTECTED
// =====================================================

app.get("/", requireFarmerPage, (req, res) => {
    res.sendFile(
        path.join(PRIVATE_DIR, "index.html")
    );
});


// =====================================================
// APPLICATION TRACKING
// =====================================================

app.get("/track.html", (req, res) => {
    res.sendFile(
        path.join(PUBLIC_DIR, "track.html")
    );
});

// =====================================================
// ADMIN LOGIN
// =====================================================

app.get("/admin-login", (req, res) => {
    res.sendFile(
        path.join(PRIVATE_DIR, "admin-login.html")
    );
});

// =====================================================
// ADMIN DASHBOARD
// =====================================================

app.get("/admin-dashboard.html", (req, res) => {
    res.sendFile(
        path.join(PRIVATE_DIR, "admin-dashboard.html")
    );
});



/* =====================================================
   GENERAL HELPERS
===================================================== */

function generateApplicationNumber() {
    const number = crypto.randomInt(0, 100000);

    return "APP-" + String(number).padStart(5, "0");
}

function generateFarmerID() {
    const number = crypto.randomInt(1000000, 10000000);

    return "ID-" + number;
}

function generateTemporaryPassword() {
    return crypto.randomBytes(12).toString("base64url");
}

function createToken(payload) {
    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || "8h"
    });
}

function getToken(req) {

    const header = req.headers.authorization || "";

    if (!header.startsWith("Bearer ")) {
        return null;
    }

    return header.slice(7);
}



/* =====================================================
   AUTHENTICATION MIDDLEWARE
===================================================== */

/* GET TOKEN: BEARER OR HTTP-ONLY COOKIE */

function getToken(req) {

    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
        return authHeader.substring(7);
    }

    return req.cookies?.farmerToken || null;
}


/* =====================================================
   GENERAL AUTHENTICATION
===================================================== */

function authenticate(req, res, next) {

    const token = getToken(req);

    if (!token) {
        return res.status(401).json({
            message: "Authentication required."
        });
    }

    try {

        req.user = jwt.verify(token, JWT_SECRET);

        next();

    } catch (error) {

        return res.status(401).json({
            message: "Invalid or expired login session."
        });

    }
}


/* =====================================================
   ADMIN AUTHENTICATION
===================================================== */

function requireAdmin(req, res, next) {

    authenticate(req, res, () => {

        if (!req.user || req.user.type !== "admin") {
            return res.status(403).json({
                message: "Administrator access required."
            });
        }

        next();

    });

}


/* =====================================================
   FARMER AUTHENTICATION
===================================================== */

function requireFarmer(req, res, next) {

    authenticate(req, res, async () => {

        if (!req.user || req.user.type !== "farmer") {
            return res.status(403).json({
                message: "Farmer access required."
            });
        }

        try {

            const result = await pool.query(
                `SELECT id, is_active, must_change_password
                 FROM farmers_credentials
                 WHERE id = $1`,
                [req.user.id]
            );

            const farmer = result.rows[0];

            if (!farmer || !farmer.is_active) {
                return res.status(403).json({
                    message: "Farmer account is inactive."
                });
            }

            req.farmer = farmer;

            next();

        } catch (error) {

            console.error("Farmer authentication error:", error);

            return res.status(500).json({
                message: "Authentication error."
            });

        }

    });

}




/* =====================================================
   REQUIRE COMPLETED FARMER PASSWORD
===================================================== */

function requireCompletedFarmerPassword(req, res, next) {

    if (req.farmer.must_change_password) {

        return res.status(403).json({
            code: "PASSWORD_CHANGE_REQUIRED",
            message: "Change your temporary password before continuing."
        });

    }

    next();

}






/* =====================================================
   1. FARMER APPLICATION POST ROUTE
   POST /api/applications
===================================================== */

app.post("/api/applications", async (req, res) => {

    const {
        fullName,
        phone,
        email,
        gender,
        ageGroup,
        county,
        subCounty,
        ward,
        village,
        farmerType,
        farmSize,
        farmingActivity,
        waterSource,
        crops,
        interests,
        challenges,
        expectations,
       
        consent
    } = req.body;

    if (!fullName || !phone || consent !== true) {

        return res.status(400).json({
            message: "Name, phone number and consent are required."
        });

    }

    if (interests !== undefined && !Array.isArray(interests)) {
    return res.status(400).json({
        message: "Interests must be submitted as an array."
    });
}

    try {

        let applicationNumber;
        let result;

        // Retry if the random application number already exists.
        for (let attempt = 0; attempt < 20; attempt++) {

            applicationNumber = generateApplicationNumber();

            try {

                
result = await pool.query(
    `INSERT INTO farmers_application (
        application_number,
        full_name,
        phone,
        email,
        gender,
        age_group,
        county,
        sub_county,
        ward,
        village,
        farmer_type,
        farm_size,
        farming_activity,
        water_source,
        crops,
        interests,
        challenges,
        expectations,
        consent
    )
    VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19
    )
    RETURNING id, application_number, application_status`,
    [
        applicationNumber,
        fullName.trim(),
        phone.trim(),
        email || null,
        gender || null,
        ageGroup || null,
        county || null,
        subCounty || null,
        ward || null,
        village || null,
        farmerType || null,
        farmSize || null,
        farmingActivity || null,
        waterSource || null,
        crops || null,
        interests || [],
        challenges || null,
        expectations || null,
        consent
    ]
);


                break;

            } catch (error) {

                if (error.code === "23505") {
                    continue;
                }

                throw error;

            }

        }

        if (!result) {
            return res.status(503).json({
                message: "Could not generate an application number. Please try again."
            });
        }

        res.status(201).json({
            message: "Application submitted successfully.",
            applicationNumber: result.rows[0].application_number,
            status: result.rows[0].application_status
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: "Unable to submit application."
        });

    }

});


/* =====================================================
   2. ADMIN LOGIN
   POST /api/admin/login
===================================================== */

app.post("/api/admin/login", async (req, res) => {

    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            message: "Email and password are required."
        });
    }

    try {

        const result = await pool.query(
            `SELECT *
             FROM admin_credentials
             WHERE LOWER(email) = LOWER($1)
             AND is_active = TRUE`,
            [email.trim()]
        );

        const admin = result.rows[0];

        if (!admin) {
            return res.status(401).json({
                message: "Invalid administrator credentials."
            });
        }

        const valid = await bcrypt.compare(
            password,
            admin.password_hash
        );

        if (!valid) {
            return res.status(401).json({
                message: "Invalid administrator credentials."
            });
        }

        await pool.query(
            `UPDATE admin_credentials
             SET last_login = NOW(),
                 updated_at = NOW()
             WHERE id = $1`,
            [admin.id]
        );

        const token = createToken({
            id: admin.id,
            type: "admin",
            role: admin.role
        });

        res.json({
            message: "Admin login successful.",
            token,
            admin: {
                id: admin.id,
                name: admin.admin_name,
                email: admin.email,
                role: admin.role
            }
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: "Administrator login failed."
        });

    }

});


/* =====================================================
   3. ADMIN DASHBOARD
   GET /api/admin/dashboard
===================================================== */

app.get(
    "/api/admin/dashboard",
    requireAdmin,
    async (req, res) => {

        try {

            const [applications, farmers, posts] =
                await Promise.all([

                    pool.query(`
                        SELECT
                            COUNT(*) FILTER (
                                WHERE application_status = 'pending'
                            ) AS pending,

                            COUNT(*) FILTER (
                                WHERE application_status = 'approved'
                            ) AS approved,

                            COUNT(*) FILTER (
                                WHERE application_status = 'rejected'
                            ) AS rejected

                        FROM farmers_application
                    `),

                    pool.query(`
                        SELECT COUNT(*) AS total_farmers
                        FROM farmers_credentials
                        WHERE is_active = TRUE
                    `),

                    pool.query(`
                        SELECT COUNT(*) AS total_posts
                        FROM community_post
                        WHERE is_archived = FALSE
                    `)

                ]);

            res.json({

                applications: applications.rows[0],

                totalFarmers: farmers.rows[0].total_farmers,

                totalPosts: posts.rows[0].total_posts

            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message: "Unable to load dashboard."
            });

        }

    }
);


/* =====================================================
   4. ADMIN VIEW APPLICATIONS
   GET /api/admin/applications
===================================================== */

app.get(
    "/api/admin/applications",
    requireAdmin,
    async (req, res) => {

        const status = req.query.status || "pending";

        const allowed = [
            "pending",
            "approved",
            "rejected",
            "all"
        ];

        if (!allowed.includes(status)) {
            return res.status(400).json({
                message: "Invalid application status."
            });
        }

        try {

            const result = await pool.query(
                `SELECT *
                 FROM farmers_application
                 WHERE ($1 = 'all' OR application_status = $1)
                 ORDER BY submitted_at DESC`,
                [status]
            );

            res.json({
                applications: result.rows
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message: "Unable to load applications."
            });

        }

    }
);


// =====================================================
// ADMIN APPROVE FARMER APPLICATION
// POST /api/admin/applications/:id/approve
//
// Database generates the unique Farmer ID.
// Farmer creates password during account activation.
// =====================================================

app.post(
    "/api/admin/applications/:id/approve",
    requireAdmin,
    async (req, res) => {

        const client = await pool.connect();

        try {

            await client.query("BEGIN");

            const applicationResult = await client.query(
                `SELECT *
                 FROM farmers_application
                 WHERE id = $1
                 FOR UPDATE`,
                [req.params.id]
            );

            const application = applicationResult.rows[0];

            if (!application) {

                await client.query("ROLLBACK");

                return res.status(404).json({
                    message: "Application not found."
                });

            }

            if (application.application_status !== "pending") {

                await client.query("ROLLBACK");

                return res.status(409).json({
                    message: "Application has already been reviewed."
                });

            }

            // Database generates farmer_id automatically.
            const credentialResult = await client.query(
                `INSERT INTO farmers_credentials (
                    application_id,
                    email,
                    password_hash,
                    must_change_password,
                    is_active
                )
                VALUES ($1, $2, NULL, FALSE, FALSE)
                RETURNING id, farmer_id, email`,
                [
                    application.id,
                    application.email
                        ? application.email.toLowerCase()
                        : null
                ]
            );

            const credential = credentialResult.rows[0];

            // Update application status.
            await client.query(
                `UPDATE farmers_application
                 SET application_status = 'approved',
                     approved_by_admin_id = $1,
                     reviewed_at = NOW(),
                     updated_at = NOW()
                 WHERE id = $2`,
                [
                    req.user.id,
                    application.id
                ]
            );

            await client.query("COMMIT");

            return res.json({

                success: true,

                message: "Farmer application approved successfully.",

                farmer: {
                    farmerId: credential.farmer_id,
                    name: application.full_name,
                    email: credential.email
                },

                activationUrl: "/community-farmers-account"

            });

        } catch (error) {

            await client.query("ROLLBACK");

            console.error("Farmer approval error:", error);

            return res.status(500).json({
                message: "Unable to approve farmer application."
            });

        } finally {

            client.release();

        }

    }
);


/* =====================================================
   6. ADMIN REJECT APPLICATION
   POST /api/admin/applications/:id/reject
===================================================== */

app.post(
    "/api/admin/applications/:id/reject",
    requireAdmin,
    async (req, res) => {

        const { remarks } = req.body;

        try {

            const result = await pool.query(
                `UPDATE farmers_application
                 SET application_status = 'rejected',
                     admin_remarks = $1,
                     approved_by_admin_id = $2,
                     reviewed_at = NOW(),
                     updated_at = NOW()
                 WHERE id = $3
                 AND application_status = 'pending'
                 RETURNING id`,
                [
                    remarks || null,
                    req.user.id,
                    req.params.id
                ]
            );

            if (!result.rowCount) {
                return res.status(404).json({
                    message: "Pending application not found."
                });
            }

            res.json({
                message: "Application rejected."
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message: "Unable to reject application."
            });

        }

    }
);

/* =====================================================
   ADMIN REGISTERED FARMERS
   GET /api/admin/farmers
===================================================== */

app.get(
    "/api/admin/farmers",
    requireAdmin,
    async (req, res) => {

        try {

            const result = await pool.query(
                `SELECT
                    fc.id,
                    fc.farmer_id,
                    fc.email,
                    fc.is_active,
                    fa.full_name,
                    fa.phone,
                    fa.county

                 FROM farmers_credentials fc

                 JOIN farmers_application fa
                 ON fa.id = fc.application_id

                 WHERE fa.application_status = 'approved'

                 ORDER BY fa.reviewed_at DESC NULLS LAST`
            );

            res.json({
                success: true,
                farmers: result.rows
            });

        } catch (error) {

            console.error("Admin farmers error:", error);

            res.status(500).json({
                message: "Unable to load registered farmers."
            });

        }

    }
);

/* =====================================================
   ADMIN DASHBOARD STATISTICS
   GET /api/admin/dashboard
===================================================== */

app.get(
    "/api/admin/dashboard",
    requireAdmin,
    async (req, res) => {

        try {

            const result = await pool.query(`
                SELECT

                    (
                        SELECT COUNT(*)
                        FROM farmers_application
                        WHERE LOWER(TRIM(application_status)) = 'pending'
                    ) AS pending,

                    (
                        SELECT COUNT(*)
                        FROM farmers_application
                        WHERE LOWER(TRIM(application_status)) = 'approved'
                    ) AS approved,

                    (
                        SELECT COUNT(*)
                        FROM farmers_application
                        WHERE LOWER(TRIM(application_status)) = 'rejected'
                    ) AS rejected,

                    (
                        SELECT COUNT(*)
                        FROM farmers_credentials
                        WHERE is_active = TRUE
                    ) AS total_farmers
            `);

            const stats = result.rows[0];

            res.json({
                applications: {
                    pending: Number(stats.pending),
                    approved: Number(stats.approved),
                    rejected: Number(stats.rejected)
                },
                totalFarmers: Number(stats.total_farmers)
            });

        } catch (error) {

            console.error("Dashboard statistics error:", error);

            res.status(500).json({
                message: "Unable to load dashboard statistics."
            });

        }

    }
);



/* =====================================================
   FARMER LOGIN
   Existing registered farmers supported
===================================================== */

app.post("/api/farmer/login", async (req, res) => {

    const { farmerId, password } = req.body;

    if (!farmerId || !password) {
        return res.status(400).json({
            message: "Farmer ID and password are required."
        });
    }

    try {

        // VERIFY EXISTING FARMER ACCOUNT

        const result = await pool.query(
            `SELECT *
             FROM farmers_credentials
             WHERE UPPER(farmer_id) = UPPER($1)
             AND is_active = TRUE`,
            [farmerId.trim()]
        );

        const farmer = result.rows[0];

        if (!farmer) {
            return res.status(401).json({
                message: "Invalid Farmer ID or password."
            });
        }

        // VERIFY EXISTING PASSWORD HASH

        const valid = await bcrypt.compare(
            password,
            farmer.password_hash
        );

        if (!valid) {
            return res.status(401).json({
                message: "Invalid Farmer ID or password."
            });
        }

        // UPDATE LAST LOGIN

        await pool.query(
            `UPDATE farmers_credentials
             SET last_login = NOW(),
                 updated_at = NOW()
             WHERE id = $1`,
            [farmer.id]
        );

        // GENERATE FARMER JWT

        const token = createToken({
            id: farmer.id,
            type: "farmer",
            farmerId: farmer.farmer_id
        });

        // SET HTTP-ONLY AUTHENTICATION COOKIE

        res.cookie("farmerToken", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 8 * 60 * 60 * 1000,
            path: "/"
        });

        // GET FARMER NAME

        const application = await pool.query(
            `SELECT full_name
             FROM farmers_application
             WHERE id = $1`,
            [farmer.application_id]
        );

        // SUCCESSFUL LOGIN

        return res.json({

            success: true,

            message: "Farmer login successful.",

            token,

            farmer: {
                farmerId: farmer.farmer_id,
                name: application.rows[0]?.full_name || "",
                mustChangePassword: false
            },

            redirect: "/community-farmers.html"

        });

    } catch (error) {

        console.error("Farmer login error:", error);

        return res.status(500).json({
            message: "Farmer login failed."
        });

    }

});
app.post("/api/farmer/logout", (req, res) => {

    res.clearCookie("farmerToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/"
    });

    return res.json({
        success: true,
        message: "Logged out successfully."
    });

});

// =====================================================
// FARMER ACCOUNT ACTIVATION
// POST /api/farmer/activate
//
// 1. Farmer enters Farmer ID.
// 2. Creates new password.
// 3. Confirms new password.
// 4. Password is hashed and saved.
// 5. update_password records the activation.
// 6. Account becomes active.
// =====================================================

app.post("/api/farmer/activate", async (req, res) => {

    const {
        farmerId,
        password,
        confirmPassword
    } = req.body;

    if (!farmerId || !password || !confirmPassword) {

        return res.status(400).json({
            success: false,
            message: "All fields are required."
        });

    }

    if (password.length < 10) {

        return res.status(400).json({
            success: false,
            message: "Password must contain at least 10 characters."
        });

    }

    if (password !== confirmPassword) {

        return res.status(400).json({
            success: false,
            message: "Passwords do not match."
        });

    }

    const client = await pool.connect();

    try {

        await client.query("BEGIN");

        // Find approved farmer awaiting activation.
        const result = await client.query(
            `SELECT
                fc.id,
                fc.application_id,
                fc.farmer_id,
                fc.password_hash,
                fc.is_active,
                fa.application_status

             FROM farmers_credentials fc

             JOIN farmers_application fa
                ON fa.id = fc.application_id

             WHERE UPPER(fc.farmer_id) = UPPER($1)

             FOR UPDATE OF fc`,
            [farmerId.trim()]
        );

        const farmer = result.rows[0];

        if (!farmer) {

            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "Invalid Farmer ID."
            });

        }

        if (farmer.application_status !== "approved") {

            await client.query("ROLLBACK");

            return res.status(403).json({
                success: false,
                message: "Your application has not been approved."
            });

        }

        if (farmer.is_active || farmer.password_hash) {

            await client.query("ROLLBACK");

            return res.status(409).json({
                success: false,
                message: "This account has already been activated. Please log in."
            });

        }

        // Hash new password.
        const passwordHash = await bcrypt.hash(
            password,
            BCRYPT_ROUNDS
        );

        // Save password and activate farmer account.
        const update = await client.query(
            `UPDATE farmers_credentials

             SET password_hash = $1,
                 is_active = TRUE,
                 must_change_password = FALSE,
                 activated_at = NOW(),
                 updated_at = NOW()

             WHERE id = $2
               AND password_hash IS NULL
               AND is_active = FALSE

             RETURNING id, farmer_id`,
            [
                passwordHash,
                farmer.id
            ]
        );

        if (!update.rowCount) {

            await client.query("ROLLBACK");

            return res.status(409).json({
                success: false,
                message: "Account activation has already been completed."
            });

        }

        // Record initial password creation.
        await client.query(
            `INSERT INTO update_password (
                farmer_credential_id,
                change_type,
                change_status
            )
            VALUES ($1, 'initial_password', 'success')`,
            [
                farmer.id
            ]
        );

        // Commit both database changes.
        await client.query("COMMIT");

        return res.status(200).json({

            success: true,

            message: "Your farmer account has been activated successfully.",

            farmerId: update.rows[0].farmer_id,

            redirect: "/community-login"

        });

    } catch (error) {

        await client.query("ROLLBACK");

        console.error("Farmer activation error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to activate your account."
        });

    } finally {

        client.release();

    }

});

/* =====================================================
   GET AUTHENTICATED FARMER PROFILE
===================================================== */

app.get(
    "/api/farmer/me",
    requireFarmer,
    async (req, res) => {

        try {

            const result = await pool.query(
                `SELECT
                    fc.id,
                    fc.farmer_id,
                    fc.profile_image_url,
                    fa.full_name

                 FROM farmers_credentials fc

                 INNER JOIN farmers_application fa
                    ON fa.id = fc.application_id

                 WHERE fc.id = $1

                 LIMIT 1`,
                [req.farmer.id]
            );

            if (!result.rowCount) {

                return res.status(404).json({
                    success: false,
                    message: "Farmer profile not found."
                });

            }

            const dbFarmer = result.rows[0];

            return res.status(200).json({

                success: true,

                farmer: {

                    id: String(dbFarmer.id),

                    farmerId: String(dbFarmer.farmer_id),

                    name: dbFarmer.full_name,

                    fullName: dbFarmer.full_name,

                    profileImage:
                        dbFarmer.profile_image_url || null

                }

            });

        } catch (error) {

            console.error(
                "Authenticated farmer profile error:",
                error
            );

            return res.status(500).json({

                success: false,

                message: "Unable to retrieve farmer profile."

            });

        }

    }
);

/* =====================================================
   UPLOAD / UPDATE FARMER PROFILE PHOTO
===================================================== */

app.post(
    "/api/farmer/profile/photo",
    requireFarmer,
    farmerProfileUpload.single("profileImage"),
    async (req, res) => {

        try {

            if (!req.file) {

                return res.status(400).json({
                    success: false,
                    message: "Please select a profile photo."
                });

            }

            const profileImageURL =
                "/uploads/farmer-profiles/" + req.file.filename;


            const result = await pool.query(
                `UPDATE farmers_credentials

                 SET profile_image_url = $1

                 WHERE id = $2

                 RETURNING
                    id,
                    farmer_id,
                    profile_image_url`,
                [
                    profileImageURL,
                    req.farmer.id
                ]
            );


            if (!result.rowCount) {

                await fs.promises.unlink(req.file.path)
                    .catch(() => {});

                return res.status(404).json({
                    success: false,
                    message: "Farmer account not found."
                });

            }


            return res.status(200).json({

    success: true,

    message: "Profile photo updated successfully.",

    profileImage: result.rows[0].profile_image_url,

    profile_image_url: result.rows[0].profile_image_url

});

        } catch (error) {

            console.error(
                "Farmer profile photo upload error:",
                error
            );

            if (req.file) {

                await fs.promises.unlink(req.file.path)
                    .catch(() => {});

            }

            return res.status(500).json({

                success: false,

                message: "Unable to update profile photo."

            });

        }

    }
);
/* =====================================================
   UPDATE AUTHENTICATED FARMER PROFILE
===================================================== */

app.patch(
    "/api/farmer/profile",
    requireFarmer,
    async (req, res) => {

        try {

            const name = String(req.body.name || "").trim();

            if (!name || name.length < 2 || name.length > 100) {
                return res.status(400).json({
                    message: "Please enter a valid farmer name."
                });
            }

            const result = await pool.query(
                `UPDATE farmers_application fa

                 SET full_name = $1

                 FROM farmers_credentials fc

                 WHERE fc.application_id = fa.id
                 AND fc.id = $2

                 RETURNING fa.full_name`,
                [name, req.user.id]
            );

            if (result.rowCount === 0) {
                return res.status(404).json({
                    message: "Farmer profile not found."
                });
            }

            res.json({
                message: "Profile updated successfully.",
                farmer: {
                    name: result.rows[0].full_name
                }
            });

        } catch (error) {

            console.error("Profile update error:", error);

            res.status(500).json({
                message: "Unable to update farmer profile."
            });

        }

    }
);
/* =====================================================
   9. MUST CHANGE PASSWORD
   GET /api/farmer/password-status

   Used after login to determine whether the farmer
   must change the temporary password.
===================================================== */

app.get(
    "/api/farmer/password-status",
    requireFarmer,
    async (req, res) => {

        res.json({
            mustChangePassword:
                req.farmer.must_change_password
        });

    }
);


/* =====================================================
   10. UPDATE FARMER PASSWORD
   POST /api/farmer/change-password
===================================================== */

app.post(
    "/api/farmer/change-password",
    requireFarmer,
    async (req, res) => {

        const {
            currentPassword,
            newPassword
        } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                message: "Current and new passwords are required."
            });
        }

        if (newPassword.length < 10) {
            return res.status(400).json({
                message: "New password must contain at least 10 characters."
            });
        }

        try {

            const result = await pool.query(
                `SELECT password_hash
                 FROM farmers_credentials
                 WHERE id = $1`,
                [req.user.id]
            );

            const farmer = result.rows[0];

            const valid = await bcrypt.compare(
                currentPassword,
                farmer.password_hash
            );

            if (!valid) {
                return res.status(401).json({
                    message: "Current password is incorrect."
                });
            }

            const newHash = await bcrypt.hash(
                newPassword,
                BCRYPT_ROUNDS
            );

            const client = await pool.connect();

            try {

                await client.query("BEGIN");

                await client.query(
                    `UPDATE farmers_credentials
                     SET password_hash = $1,
                         must_change_password = FALSE,
                         updated_at = NOW()
                     WHERE id = $2`,
                    [newHash, req.user.id]
                );

                await client.query(
                    `INSERT INTO update_password (
                        farmer_credential_id,
                        change_type,
                        change_status
                    )
                    VALUES ($1,'farmer_change','success')`,
                    [req.user.id]
                );

                await client.query("COMMIT");

            } catch (error) {

                await client.query("ROLLBACK");
                throw error;

            } finally {

                client.release();

            }

            res.json({
                message: "Password updated successfully.",
                redirect: "community.html"
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message: "Unable to update password."
            });

        }

    }
);


/* =====================================================
   11. ADMIN RESET FARMER PASSWORD
   POST /api/admin/farmers/:id/reset-password

   Admin can generate a new temporary password.
===================================================== */

app.post(
    "/api/admin/farmers/:id/reset-password",
    requireAdmin,
    async (req, res) => {

        try {

            const temporaryPassword =
                generateTemporaryPassword();

            const passwordHash = await bcrypt.hash(
                temporaryPassword,
                BCRYPT_ROUNDS
            );

            const client = await pool.connect();

            try {

                await client.query("BEGIN");

                const result = await client.query(
                    `UPDATE farmers_credentials
                     SET password_hash = $1,
                         must_change_password = TRUE,
                         updated_at = NOW()
                     WHERE id = $2
                     RETURNING id`,
                    [passwordHash, req.params.id]
                );

                if (!result.rowCount) {

                    await client.query("ROLLBACK");

                    return res.status(404).json({
                        message: "Farmer account not found."
                    });

                }

                await client.query(
                    `INSERT INTO update_password (
                        farmer_credential_id,
                        admin_credential_id,
                        change_type,
                        change_status
                    )
                    VALUES ($1,$2,'admin_reset','success')`,
                    [req.params.id, req.user.id]
                );

                await client.query("COMMIT");

            } catch (error) {

                await client.query("ROLLBACK");
                throw error;

            } finally {

                client.release();

            }

            res.json({
                message: "Temporary password generated.",
                temporaryPassword,
                mustChangePassword: true
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message: "Password reset failed."
            });

        }

    }
);


// =====================================================
// TRACK FARMER APPLICATION STATUS
// GET /api/applications/:applicationNumber?phone=...
// =====================================================

app.get(
    "/api/applications/:applicationNumber",
    async (req, res) => {

        try {

            const applicationNumber =
                req.params.applicationNumber.trim();

            const phone = req.query.phone;

            if (!applicationNumber || !phone) {

                return res.status(400).json({
                    success: false,
                    message: "Application number and registered phone number are required."
                });

            }

            const result = await pool.query(
                `SELECT
                    a.id,
                    a.application_number,
                    a.full_name,
                    a.phone,
                    a.application_status,
                    a.submitted_at,
                    a.reviewed_at,

                    c.farmer_id,
                    COALESCE(c.is_active, FALSE) AS account_activated,
                    c.activated_at

                 FROM farmers_application a

                 LEFT JOIN farmers_credentials c
                    ON c.application_id = a.id

                 WHERE a.application_number = $1
                   AND a.phone = $2`,
                [
                    applicationNumber,
                    phone.trim()
                ]
            );

            if (!result.rowCount) {

                return res.status(404).json({
                    success: false,
                    message: "Application not found. Check your application number and registered phone number."
                });

            }

            const application = result.rows[0];

            const approved =
                application.application_status === "approved";

            const rejected =
                application.application_status === "rejected";

            const accountActivated =
                approved && application.account_activated;

            return res.status(200).json({

                success: true,

                application: {

                    applicationNumber:
                        application.application_number,

                    fullName:
                        application.full_name,

                    farmerId:
                        approved ? application.farmer_id : null,

                    submittedAt:
                        application.submitted_at,

                    reviewedAt:
                        application.reviewed_at,

                    activatedAt:
                        accountActivated
                            ? application.activated_at
                            : null,

                    status:
                        application.application_status,

                    accountActivated:
                        accountActivated,

                    nextStep:
                        rejected
                            ? "application_rejected"
                            : !approved
                                ? "awaiting_review"
                                : !accountActivated
                                    ? "activate_account"
                                    : "login"

                }

            });

        } catch (error) {

            console.error(
                "Application tracking error:",
                error
            );

            return res.status(500).json({

                success: false,

                message: "Unable to retrieve application status."

            });

        }

    }
);

/* =====================================================
   PUBLIC COMMUNITY POSTS
   GET /api/community/posts
===================================================== */

app.get(
    "/api/community/posts",
    requireFarmer,
    async (req, res) => {

        try {

            const result = await pool.query(

                `SELECT

                    p.id,
                    p.title,
                    p.content,
                    p.category,
                    p.image_url,
                    p.status,
                    p.created_at,
                    p.updated_at,

                    p.admin_id,
                    p.farmer_credential_id,

                    CASE
                        WHEN p.admin_id IS NOT NULL
                            THEN 'admin'
                        WHEN p.farmer_credential_id IS NOT NULL
                            THEN 'farmer'
                        ELSE 'unknown'
                    END AS author_type,

                    COALESCE(
                        fa.full_name,
                        CASE
                            WHEN p.admin_id IS NOT NULL
                                THEN 'Gadeh Administration'
                            ELSE 'Community Farmer'
                        END
                    ) AS author,

                    fc.farmer_id,
                    fc.profile_image_url AS profile_image_url,

                    (p.farmer_credential_id = $1) AS is_mine,

                    (
                        SELECT COUNT(*)
                        FROM community_post_like l
                        WHERE l.post_id = p.id
                    ) AS like_count,

                    EXISTS (

                        SELECT 1
                        FROM community_post_like l

                        WHERE l.post_id = p.id
                        AND l.farmer_credential_id = $1

                    ) AS liked_by_me,

                    (
                        SELECT COUNT(*)
                        FROM community_post_comment c
                        WHERE c.post_id = p.id
                    ) AS comment_count,

                    COALESCE(

                        (

                            SELECT json_agg(

                                json_build_object(

                                    'id', c.id,

                                    'content', c.content,

                                    'author', ca.full_name,

                                    'farmer_id', cc.farmer_id,

                                    'created_at', c.created_at

                                )

                                ORDER BY c.created_at ASC

                            )

                            FROM community_post_comment c

                            INNER JOIN farmers_credentials cc
                                ON cc.id = c.farmer_credential_id

                            INNER JOIN farmers_application ca
                                ON ca.id = cc.application_id

                            WHERE c.post_id = p.id

                        ),

                        '[]'::json

                    ) AS comments

                FROM community_post p

                LEFT JOIN farmers_credentials fc
                    ON fc.id = p.farmer_credential_id

                LEFT JOIN farmers_application fa
                    ON fa.id = fc.application_id

                WHERE p.status = 'published'

                AND p.is_archived IS NOT TRUE

                ORDER BY p.created_at DESC`

                ,

                [req.farmer.id]

            );

            res.json({

                success: true,

                posts: result.rows

            });

        } catch (error) {

            console.error(
                "Community posts error:",
                error
            );

            res.status(500).json({

                success: false,

                message: "Unable to load community posts."

            });

        }

    }
);


/* =====================================================
   CREATE COMMUNITY POST
   POST /api/community/posts
===================================================== */

app.post(
    "/api/community/posts",
    requireFarmer,
    communityUpload.single("image"),
    async (req, res) => {

        try {

            const content = (
                req.body.content || ""
            ).trim();

            const category = (
                req.body.category || "General Agriculture"
            ).trim();

            const title = (
                req.body.title || content.substring(0, 80)
            ).trim();

            if (!content) {

                if (req.file) {
                    fs.unlinkSync(req.file.path);
                }

                return res.status(400).json({

                    success: false,

                    message: "Please write something before publishing."

                });

            }

            const imageURL = req.file
                ? `/uploads/community-posts/${req.file.filename}`
                : null;

            const result = await pool.query(

                `INSERT INTO community_post (

                    title,
                    content,
                    category,
                    image_url,
                    status,
                    admin_id,
                    farmer_credential_id,
                    is_archived

                )

                VALUES (

                    $1,
                    $2,
                    $3,
                    $4,
                    'published',
                    NULL,
                    $5,
                    FALSE

                )

                RETURNING

                    id,
                    title,
                    content,
                    category,
                    image_url,
                    status,
                    farmer_credential_id,
                    created_at`

                ,

                [
                    title,
                    content,
                    category,
                    imageURL,
                    req.farmer.id
                ]

            );

            res.status(201).json({

                success: true,

                message: "Post published successfully.",

                post: result.rows[0]

            });

        } catch (error) {

            console.error(
                "Create community post error:",
                error
            );

            if (req.file && fs.existsSync(req.file.path)) {

                fs.unlinkSync(req.file.path);

            }

            res.status(500).json({

                success: false,

                message: "Unable to publish community post."

            });

        }

    }
);

/* =====================================================
   LIKE / UNLIKE COMMUNITY POST
   POST /api/community/posts/:postId/like
===================================================== */

app.post(
    "/api/community/posts/:postId/like",
    requireFarmer,
    async (req, res) => {

        const client = await pool.connect();

        try {

            const postID = req.params.postId;

            const farmerID = req.farmer.id;

            await client.query("BEGIN");

            const post = await client.query(

                `SELECT id

                 FROM community_post

                 WHERE id = $1

                 AND status = 'published'

                 AND is_archived IS NOT TRUE

                 FOR UPDATE`

                ,

                [postID]

            );

            if (!post.rowCount) {

                await client.query("ROLLBACK");

                return res.status(404).json({

                    success: false,

                    message: "Community post not found."

                });

            }

            const existingLike = await client.query(

                `SELECT id

                 FROM community_post_like

                 WHERE post_id = $1

                 AND farmer_credential_id = $2`

                ,

                [postID, farmerID]

            );

            let liked;

            if (existingLike.rowCount > 0) {

                await client.query(

                    `DELETE FROM community_post_like

                     WHERE post_id = $1

                     AND farmer_credential_id = $2`

                    ,

                    [postID, farmerID]

                );

                liked = false;

            } else {

                await client.query(

                    `INSERT INTO community_post_like (

                        post_id,
                        farmer_credential_id

                    )

                    VALUES ($1, $2)`

                    ,

                    [postID, farmerID]

                );

                liked = true;

            }

            const count = await client.query(

                `SELECT COUNT(*) AS total

                 FROM community_post_like

                 WHERE post_id = $1`

                ,

                [postID]

            );

            await client.query("COMMIT");

            res.json({

                success: true,

                liked: liked,

                likes: Number(count.rows[0].total)

            });

        } catch (error) {

            await client.query("ROLLBACK");

            console.error(
                "Community like error:",
                error
            );

            res.status(500).json({

                success: false,

                message: "Unable to update post like."

            });

        } finally {

            client.release();

        }

    }
);


/* =====================================================
   ADD COMMUNITY POST COMMENT
   POST /api/community/posts/:postId/comments
===================================================== */

app.post(
    "/api/community/posts/:postId/comments",
    requireFarmer,
    async (req, res) => {

        try {

            const postID = req.params.postId;

            const farmerID = req.farmer.id;

            const content = (
                req.body.content || ""
            ).trim();

            if (!content) {

                return res.status(400).json({

                    success: false,

                    message: "Comment cannot be empty."

                });

            }

            if (content.length > 2000) {

                return res.status(400).json({

                    success: false,

                    message: "Comment cannot exceed 2000 characters."

                });

            }

            const post = await pool.query(

                `SELECT id

                 FROM community_post

                 WHERE id = $1

                 AND status = 'published'

                 AND is_archived IS NOT TRUE`

                ,

                [postID]

            );

            if (!post.rowCount) {

                return res.status(404).json({

                    success: false,

                    message: "Community post not found."

                });

            }

            // INSERT NEW COMMENT

            const result = await pool.query(

                `INSERT INTO community_post_comment (

                    post_id,
                    farmer_credential_id,
                    content

                )

                VALUES ($1, $2, $3)

                RETURNING

                    id,
                    post_id,
                    farmer_credential_id,
                    content,
                    created_at`

                ,

                [
                    postID,
                    farmerID,
                    content
                ]

            );


            // GET UPDATED COMMENT COUNT

            const count = await pool.query(

                `SELECT COUNT(*) AS total

                 FROM community_post_comment

                 WHERE post_id = $1`

                ,

                [postID]

            );


            // RETURN UPDATED COMMENT INFORMATION

            return res.status(201).json({

                success: true,

                message: "Comment added successfully.",

                comment: result.rows[0],

                comments: Number(count.rows[0].total),

                comments_count: Number(count.rows[0].total)

            });

        } catch (error) {

            console.error(
                "Add community comment error:",
                error
            );

            return res.status(500).json({

                success: false,

                message: "Unable to add comment."

            });

        }

    }
);


/* =====================================================
   12. ADMIN MANAGE COMMUNITY POSTS
   GET /api/admin/posts
===================================================== */

app.get(
    "/api/admin/posts",
    requireAdmin,
    async (req, res) => {

        try {

            const result = await pool.query(

                `SELECT

                    p.id,
                    p.title,
                    p.content,
                    p.category,
                    p.image_url,
                    p.status,
                    p.admin_id,
                    p.farmer_credential_id,
                    p.is_archived,
                    p.created_at,
                    p.updated_at,
                    p.archived_at,

                    CASE
                        WHEN p.admin_id IS NOT NULL
                            THEN 'admin'
                        WHEN p.farmer_credential_id IS NOT NULL
                            THEN 'farmer'
                        ELSE 'unknown'
                    END AS author_type,

                    fc.farmer_id,

                    fa.full_name,

                    (
                        SELECT COUNT(*)
                        FROM community_post_like l
                        WHERE l.post_id = p.id
                    ) AS likes_count,

                    (
                        SELECT COUNT(*)
                        FROM community_post_comment c
                        WHERE c.post_id = p.id
                    ) AS comments_count

                FROM community_post p

                LEFT JOIN farmers_credentials fc
                    ON fc.id = p.farmer_credential_id

                LEFT JOIN farmers_application fa
                    ON fa.id = fc.application_id

                ORDER BY p.created_at DESC`

            );

            res.json({

                success: true,

                posts: result.rows

            });

        } catch (error) {

            console.error("Admin community posts error:", error);

            res.status(500).json({

                success: false,

                message: "Unable to load community posts."

            });

        }

    }
);
/* =====================================================
   13. ADMIN ARCHIVE COMMUNITY POST
===================================================== */

app.patch(
    "/api/admin/posts/:id/archive",
    requireAdmin,
    async (req, res) => {

        try {

            const result = await pool.query(

                `UPDATE community_post

                 SET is_archived = TRUE,
                     archived_at = NOW(),
                     updated_at = NOW()

                 WHERE id = $1

                 RETURNING id`,

                [req.params.id]

            );

            if (!result.rowCount) {

                return res.status(404).json({

                    success: false,
                    message: "Post not found."

                });

            }

            res.json({

                success: true,
                message: "Post archived successfully."

            });

        } catch (error) {

            console.error("Archive post error:", error);

            res.status(500).json({

                success: false,
                message: "Unable to archive post."

            });

        }

    }
);
/* =====================================================
   14. ADMIN RESTORE COMMUNITY POST
===================================================== */

app.patch(
    "/api/admin/posts/:id/restore",
    requireAdmin,
    async (req, res) => {

        try {

            const result = await pool.query(

                `UPDATE community_post

                 SET is_archived = FALSE,
                     archived_at = NULL,
                     updated_at = NOW()

                 WHERE id = $1

                 RETURNING id`,

                [req.params.id]

            );

            if (!result.rowCount) {

                return res.status(404).json({

                    success: false,
                    message: "Post not found."

                });

            }

            res.json({

                success: true,
                message: "Post restored successfully."

            });

        } catch (error) {

            console.error("Restore post error:", error);

            res.status(500).json({

                success: false,
                message: "Unable to restore post."

            });

        }

    }
);
/* =====================================================
   15. ADMIN PERMANENTLY DELETE COMMUNITY POST
===================================================== */

app.delete(
    "/api/admin/posts/:id",
    requireAdmin,
    async (req, res) => {

        const client = await pool.connect();

        try {

            await client.query("BEGIN");

            const postID = req.params.id;

            const existing = await client.query(

                `SELECT id, image_url
                 FROM community_post
                 WHERE id = $1
                 FOR UPDATE`,

                [postID]

            );

            if (!existing.rowCount) {

                await client.query("ROLLBACK");

                return res.status(404).json({

                    success: false,
                    message: "Post not found."

                });

            }

            await client.query(

                `DELETE FROM community_post_like
                 WHERE post_id = $1`,

                [postID]

            );

            await client.query(

                `DELETE FROM community_post_comment
                 WHERE post_id = $1`,

                [postID]

            );

            await client.query(

                `DELETE FROM community_post
                 WHERE id = $1`,

                [postID]

            );

            await client.query("COMMIT");

            res.json({

                success: true,

                message: "Post permanently deleted."

            });

        } catch (error) {

            await client.query("ROLLBACK");

            console.error("Delete post error:", error);

            res.status(500).json({

                success: false,
                message: "Unable to delete post."

            });

        } finally {

            client.release();

        }

    }
);

/* =====================================================
   GADEH — NORTHERN KENYA WEATHER API
   GET /api/weather?location=garissa
===================================================== */

const WEATHER_LOCATIONS = {
    garissa: {
        name: "Garissa",
        latitude:  -0.4536,
        longitude: 39.6401
    },

    wajir: {
        name: "Wajir",
        latitude: 1.7471,
        longitude: 40.0573
    },

    mandera: {
        name: "Mandera",
        latitude: 3.9366,
        longitude: 41.8670
    },

    isiolo: {
        name: "Isiolo",
        latitude: 0.3556,
        longitude: 37.5822
    },

    moyale: {
        name: "Moyale",
        latitude: 3.5266,
        longitude: 39.0561
    }
};

// Cache results for 10 minutes to avoid unnecessary API requests.
const weatherCache = new Map();

app.get("/api/weather", async (req, res) => {

    try {

        const locationKey = String(
            req.query.location || "garissa"
        ).toLowerCase();

        const location = WEATHER_LOCATIONS[locationKey];

        if (!location) {
            return res.status(400).json({
                success: false,
                message: "Unsupported weather location."
            });
        }

        const cached = weatherCache.get(locationKey);

        if (
            cached &&
            Date.now() - cached.timestamp < 10 * 60 * 1000
        ) {
            return res.json(cached.data);
        }

        const weatherURL = new URL(
            "https://api.open-meteo.com/v1/forecast"
        );

        weatherURL.search = new URLSearchParams({

            latitude: String(location.latitude),

            longitude: String(location.longitude),

            current: [
                "temperature_2m",
                "relative_humidity_2m",
                "apparent_temperature",
                "is_day",
                "precipitation",
                "rain",
                "weather_code",
                "wind_speed_10m",
                "wind_direction_10m"
            ].join(","),

            hourly: [
                "temperature_2m",
                "precipitation_probability",
                "precipitation",
                "weather_code"
            ].join(","),

            daily: [
                "weather_code",
                "temperature_2m_max",
                "temperature_2m_min",
                "precipitation_probability_max",
                "precipitation_sum",
                "sunrise",
                "sunset"
            ].join(","),

            timezone: "Africa/Nairobi",

            forecast_days: "5",

            temperature_unit: "celsius",

            wind_speed_unit: "kmh",

            precipitation_unit: "mm"

        }).toString();

        const response = await fetch(weatherURL);

        if (!response.ok) {
            throw new Error(
                `Weather provider returned HTTP ${response.status}`
            );
        }

        const weather = await response.json();

        if (!weather.current || !weather.daily) {
            throw new Error("Incomplete weather data received.");
        }

        const result = {
            success: true,
            location,
            weather,
            source: "Open-Meteo",
            fetchedAt: new Date().toISOString()
        };

        weatherCache.set(locationKey, {
            timestamp: Date.now(),
            data: result
        });

        res.json(result);

    } catch (error) {

        console.error("GADEH weather API error:", error);

        res.status(502).json({
            success: false,
            message: "Unable to retrieve weather information. Please try again."
        });

    }

});

/* =====================================================
   SERVER HEALTH CHECK
===================================================== */

app.get("/api/health", async (req, res) => {

    try {

        await pool.query("SELECT 1");

        res.json({
            status: "online",
            database: "connected"
        });

    } catch {

        res.status(503).json({
            status: "offline",
            database: "disconnected"
        });

    }

});


/* =====================================================
   SERVER START
===================================================== */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log(
        `Community Farmers server running on port ${PORT}`
    );

});


