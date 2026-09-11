const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");
const multer = require("multer");
const app = express();

const PORT = 3000;
const fs = require("fs");

const uploadFolder = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadFolder)) {
    fs.mkdirSync(uploadFolder);
}
const storage = multer.diskStorage({

    destination: function (req, file, cb) {
        cb(null, uploadFolder);
    },

    filename: function (req, file, cb) {

        const uniqueName =
            Date.now() + "-" + file.originalname;

        cb(null, uniqueName);

    }

});

const upload = multer({
    storage: storage
});


/* =========================
   DATABASE
========================= */

const db = new Database("rewear.db");


db.exec(`
    CREATE TABLE IF NOT EXISTS users (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        name TEXT NOT NULL,

        email TEXT UNIQUE NOT NULL,

        password TEXT NOT NULL

    )
`);

/* =========================
   CLOTHING LISTINGS DATABASE
========================= */

db.exec(`
    CREATE TABLE IF NOT EXISTS listings (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        user_id INTEGER NOT NULL,

        title TEXT NOT NULL,

        category TEXT NOT NULL,

        condition TEXT NOT NULL,

        price REAL NOT NULL,

        listing_type TEXT NOT NULL,

        description TEXT NOT NULL,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (user_id) REFERENCES users(id)

    )
`);
/* Add gender column if it does not exist */
/* =========================
   MESSAGES DATABASE
========================= */

db.exec(`
    CREATE TABLE IF NOT EXISTS messages (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        sender_id INTEGER NOT NULL,

        receiver_id INTEGER NOT NULL,

        message TEXT NOT NULL,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (sender_id) REFERENCES users(id),

        FOREIGN KEY (receiver_id) REFERENCES users(id)

    )
`);

try {

    db.exec(`
        ALTER TABLE listings
        ADD COLUMN gender TEXT NOT NULL DEFAULT 'Unisex'
    `);

} catch (error) {

    // Column already exists
}
try {

    db.exec(`
        ALTER TABLE listings
        ADD COLUMN image TEXT
    `);

} catch (error) {

    // Image column already exists

}

/* =========================
   MIDDLEWARE
========================= */

app.use(express.json());

app.use(express.urlencoded({
    extended: true
}));


app.use(session({

    secret: "rewear-secret-key",

    resave: false,

    saveUninitialized: false,

    cookie: {
        maxAge: 1000 * 60 * 60 * 4
    }

}));


/*
    This tells Express to serve
    our HTML files.
*/

app.use(express.static(__dirname));
app.use(
    "/uploads",
    express.static(uploadFolder)
);


/* =========================
   CHECK CURRENT USER
========================= */

app.get("/api/me", (req, res) => {

    if (!req.session.userId) {

        return res.json({
            loggedIn: false
        });

    }


    const user = db.prepare(`
        SELECT id, name, email
        FROM users
        WHERE id = ?
    `).get(req.session.userId);


    res.json({
        loggedIn: true,
        user: user
    });

});


/* =========================
   SIGN UP
========================= */

app.post("/api/signup", (req, res) => {

    const {
        name,
        email,
        password
    } = req.body;


    /* Check fields */

    if (!name || !email || !password) {

        return res.status(400).json({

            error: "Please fill all fields."

        });

    }


    /* Check password */

    if (password.length < 6) {

        return res.status(400).json({

            error:
                "Password must contain at least 6 characters."

        });

    }


    try {

        /* Encrypt password */

        const hashedPassword =
            bcrypt.hashSync(password, 10);


        /* Save user */

        const result = db.prepare(`
            INSERT INTO users
            (name, email, password)

            VALUES
            (?, ?, ?)
        `).run(
            name,
            email,
            hashedPassword
        );


        /* Login user automatically */

        req.session.userId =
            result.lastInsertRowid;


        res.json({

            success: true,

            message:
                "Account created successfully."

        });


    } catch (error) {

        res.status(400).json({

            error:
                "This email is already registered."

        });

    }

});


/* =========================
   LOGIN
========================= */

app.post("/api/login", (req, res) => {

    const {
        email,
        password
    } = req.body;


    const user = db.prepare(`
        SELECT *
        FROM users
        WHERE email = ?
    `).get(email);


    if (!user) {

        return res.status(401).json({

            error:
                "Invalid email or password."

        });

    }


    /* Check password */

    const passwordCorrect =
        bcrypt.compareSync(
            password,
            user.password
        );


    if (!passwordCorrect) {

        return res.status(401).json({

            error:
                "Invalid email or password."

        });

    }


    /* Create login session */

    req.session.userId =
        user.id;


    res.json({

        success: true,

        message:
            "Login successful."

    });

});
/* =========================
   CREATE CLOTHING LISTING
========================= */

app.post("/api/listings", upload.single("image"), (req, res) => {

    if (!req.session.userId) {

        return res.status(401).json({

            message: "Please login first."

        });

    }


    const {
        title,
        category,
        gender,
        condition,
        price,
        listingType,
        description
    } = req.body;


    if (
        !title ||
        !category ||
        !gender ||
        !condition ||
        !price ||
        !listingType ||
        !description
    ) {

        return res.status(400).json({

            message: "Please fill all fields."

        });

    }


    try {

        const image =
            req.file
                ? "/uploads/" + req.file.filename
                : null;


        const result = db.prepare(`

            INSERT INTO listings
            (
                user_id,
                title,
                category,
                gender,
                condition,
                price,
                listing_type,
                description,
                image
            )

            VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?)

        `).run(

            req.session.userId,
            title,
            category,
            gender,
            condition,
            price,
            listingType,
            description,
            image

        );


        res.json({

            success: true,

            message:
                "Clothing listed successfully.",

            listingId:
                result.lastInsertRowid

        });

    }

    catch (error) {

        console.error(error);

        res.status(500).json({

            message:
                "Could not create listing."

        });

    }

});
/* =========================
   GET MY LISTINGS
========================= */

app.get("/api/my-listings", (req, res) => {

    if (!req.session.userId) {

        return res.status(401).json({

            loggedIn: false,

            message: "Please login first."

        });

    }


    const listings = db.prepare(`

        SELECT
            id,
            title,
            category,
            gender,
            condition,
            price,
            listing_type,
            description,
            created_at

        FROM listings

        WHERE user_id = ?

        ORDER BY created_at DESC

    `).all(req.session.userId);


    res.json({

        loggedIn: true,

        listings: listings

    });

});
/* =========================
   DELETE MY LISTING
========================= */

app.delete("/api/listings/:id", (req, res) => {

    if (!req.session.userId) {

        return res.status(401).json({

            message: "Please login first."

        });

    }


    const listing = db.prepare(`

        SELECT *

        FROM listings

        WHERE id = ?

        AND user_id = ?

    `).get(

        req.params.id,
        req.session.userId

    );


    if (!listing) {

        return res.status(404).json({

            message:
                "Listing not found."

        });

    }


    try {

        /* Delete image file */

        if (listing.image) {

            const imagePath =
                path.join(
                    __dirname,
                    listing.image
                        .replace("/", "")
                );

            if (fs.existsSync(imagePath)) {

                fs.unlinkSync(imagePath);

            }

        }


        /* Delete database record */

        db.prepare(`

            DELETE FROM listings

            WHERE id = ?

            AND user_id = ?

        `).run(

            req.params.id,
            req.session.userId

        );


        res.json({

            success: true,

            message:
                "Listing deleted successfully."

        });

    }

    catch (error) {

        console.error(error);

        res.status(500).json({

            message:
                "Could not delete listing."

        });

    }

});
/* =========================
   GET ALL LISTINGS
========================= */

app.get("/api/listings", (req, res) => {

    const listings = db.prepare(`

        SELECT
            listings.id,
            listings.title,
            listings.category,
            listings.gender,
            listings.condition,
            listings.price,
            listings.listing_type,
            listings.description,
            listings.image,
            users.name AS seller,
users.id AS seller_id

        FROM listings

        JOIN users
        ON listings.user_id = users.id

        ORDER BY listings.created_at DESC

    `).all();


    res.json({

        listings: listings

    });

});
/* =========================
   SEND MESSAGE
========================= */

app.post("/api/messages", (req, res) => {

    if (!req.session.userId) {

        return res.status(401).json({
            message: "Please login first."
        });

    }


    const {
        receiverId,
        message
    } = req.body;


    if (!receiverId || !message) {

        return res.status(400).json({
            message: "Message cannot be empty."
        });

    }


    try {

        db.prepare(`

            INSERT INTO messages
            (
                sender_id,
                receiver_id,
                message
            )

            VALUES
            (?, ?, ?)

        `).run(

            req.session.userId,
            receiverId,
            message.trim()

        );


        res.json({
            success: true
        });

    }

    catch (error) {

        console.error(error);

        res.status(500).json({
            message: "Could not send message."
        });

    }

});
/* =========================
   GET CHAT MESSAGES
========================= */

app.get("/api/messages/:userId", (req, res) => {

    if (!req.session.userId) {

        return res.status(401).json({
            message: "Please login first."
        });

    }


    const currentUserId =
        req.session.userId;

    const otherUserId =
        req.params.userId;


    const messages = db.prepare(`

        SELECT
            messages.id,
            messages.sender_id,
            messages.receiver_id,
            messages.message,
            messages.created_at,
            users.name AS sender_name

        FROM messages

        JOIN users
        ON messages.sender_id = users.id

        WHERE
        (
            sender_id = ?
            AND receiver_id = ?
        )

        OR

        (
            sender_id = ?
            AND receiver_id = ?
        )

        ORDER BY messages.created_at ASC

    `).all(

        currentUserId,
        otherUserId,

        otherUserId,
        currentUserId

    );


    res.json({
        messages: messages
    });

});
app.get("/api/user/:id", (req, res) => {

    const user = db.prepare(`
        SELECT id, name
        FROM users
        WHERE id = ?
    `).get(req.params.id);


    if (!user) {

        return res.status(404).json({
            message: "User not found."
        });

    }


    res.json({
        user: user
    });

});
/* =========================
   GET MY CONVERSATIONS
========================= */

app.get("/api/conversations", (req, res) => {

    if (!req.session.userId) {

        return res.status(401).json({
            message: "Please login first."
        });

    }


    const currentUserId =
        req.session.userId;


    const conversations = db.prepare(`

        SELECT
            u.id,
            u.name,

            (
                SELECT message

                FROM messages m

                WHERE
                    (
                        m.sender_id = ?
                        AND m.receiver_id = u.id
                    )

                    OR

                    (
                        m.sender_id = u.id
                        AND m.receiver_id = ?
                    )

                ORDER BY m.created_at DESC

                LIMIT 1

            ) AS last_message,


            (
                SELECT created_at

                FROM messages m

                WHERE
                    (
                        m.sender_id = ?
                        AND m.receiver_id = u.id
                    )

                    OR

                    (
                        m.sender_id = u.id
                        AND m.receiver_id = ?
                    )

                ORDER BY m.created_at DESC

                LIMIT 1

            ) AS last_message_time


        FROM users u

        WHERE u.id IN (

            SELECT sender_id

            FROM messages

            WHERE receiver_id = ?

            UNION

            SELECT receiver_id

            FROM messages

            WHERE sender_id = ?

        )

        ORDER BY last_message_time DESC

    `).all(

        currentUserId,
        currentUserId,

        currentUserId,
        currentUserId,

        currentUserId,
        currentUserId

    );


    res.json({
        conversations: conversations
    });

});


/* =========================
   LOGOUT
========================= */

app.post("/api/logout", (req, res) => {

    req.session.destroy(() => {

        res.json({
            success: true
        });

    });

});
/* =========================
   WISHLIST
========================= */

db.exec(`
    CREATE TABLE IF NOT EXISTS wishlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        listing_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, listing_id),
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(listing_id) REFERENCES listings(id)
    )
`);


/* ADD TO WISHLIST */

app.post("/api/wishlist", (req, res) => {

    if (!req.session.userId) {
        return res.status(401).json({
            message: "Please login first."
        });
    }

    const { listingId } = req.body;

    if (!listingId) {
        return res.status(400).json({
            message: "Listing ID is required."
        });
    }

    try {

        db.prepare(`
            INSERT INTO wishlist
            (user_id, listing_id)
            VALUES (?, ?)
        `).run(
            req.session.userId,
            listingId
        );

        res.json({
            success: true,
            message: "Added to wishlist."
        });

    } catch (error) {

        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {

            return res.json({
                success: true,
                message: "Already in wishlist."
            });

        }

        console.error(error);

        res.status(500).json({
            message: "Could not add to wishlist."
        });
    }
});


/* GET MY WISHLIST */

app.get("/api/wishlist", (req, res) => {

    if (!req.session.userId) {
        return res.status(401).json({
            message: "Please login first."
        });
    }

    const wishlist = db.prepare(`
        SELECT
            listings.id,
            listings.title,
            listings.category,
            listings.gender,
            listings.condition,
            listings.price,
            listings.listing_type,
            listings.description,
            listings.image,
            users.name AS seller
        FROM wishlist
        JOIN listings
            ON wishlist.listing_id = listings.id
        JOIN users
            ON listings.user_id = users.id
        WHERE wishlist.user_id = ?
        ORDER BY wishlist.created_at DESC
    `).all(req.session.userId);

    res.json({
        wishlist: wishlist
    });
});


/* REMOVE FROM WISHLIST */

app.delete("/api/wishlist/:listingId", (req, res) => {

    if (!req.session.userId) {
        return res.status(401).json({
            message: "Please login first."
        });
    }

    db.prepare(`
        DELETE FROM wishlist
        WHERE user_id = ?
        AND listing_id = ?
    `).run(
        req.session.userId,
        req.params.listingId
    );

    res.json({
        success: true,
        message: "Removed from wishlist."
    });
});


/* =========================
   ORDERS / BUY
========================= */

db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        buyer_id INTEGER NOT NULL,
        listing_id INTEGER NOT NULL,
        seller_id INTEGER NOT NULL,
        price REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'Placed',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(buyer_id) REFERENCES users(id),
        FOREIGN KEY(listing_id) REFERENCES listings(id),
        FOREIGN KEY(seller_id) REFERENCES users(id)
    )
`);


/* BUY LISTING */

app.post("/api/buy", (req, res) => {

    if (!req.session.userId) {
        return res.status(401).json({
            message: "Please login first."
        });
    }

    const { listingId } = req.body;

    if (!listingId) {
        return res.status(400).json({
            message: "Listing ID is required."
        });
    }

    const listing = db.prepare(`
        SELECT *
        FROM listings
        WHERE id = ?
    `).get(listingId);

    if (!listing) {
        return res.status(404).json({
            message: "Listing not found."
        });
    }

    if (listing.user_id === req.session.userId) {
        return res.status(400).json({
            message: "You cannot buy your own listing."
        });
    }

    try {

        const result = db.prepare(`
            INSERT INTO orders
            (
                buyer_id,
                listing_id,
                seller_id,
                price,
                status
            )
            VALUES (?, ?, ?, ?, ?)
        `).run(
            req.session.userId,
            listing.id,
            listing.user_id,
            listing.price,
            "Placed"
        );

        res.json({
            success: true,
            message: "Order placed successfully.",
            orderId: result.lastInsertRowid
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: "Could not place order."
        });
    }
});


/* GET MY ORDERS */

app.get("/api/orders", (req, res) => {

    if (!req.session.userId) {
        return res.status(401).json({
            message: "Please login first."
        });
    }

    const orders = db.prepare(`
        SELECT
            orders.id,
            orders.price,
            orders.status,
            orders.created_at,
            listings.title,
            listings.image,
            users.name AS seller
        FROM orders
        JOIN listings
            ON orders.listing_id = listings.id
        JOIN users
            ON orders.seller_id = users.id
        WHERE orders.buyer_id = ?
        ORDER BY orders.created_at DESC
    `).all(req.session.userId);

    res.json({
        orders: orders
    });
});


/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {

    console.log(
        `ReWear AI running at http://localhost:${PORT}`
    );

});