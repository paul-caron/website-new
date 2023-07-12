import express from "express";
import dotenv from "dotenv";
import { logEvents, logger } from "./middleware/logger";
import errorHandler from "./middleware/errorHandler";
import cookieParser from "cookie-parser";
import cors from "cors";
import corsOptions from "./config/corsOptions";
import path from "path";
import connectDB from "./config/dbConn";
import mongoose from "mongoose";
import userRoutes from "./routes/userRoutes";

dotenv.config();

const PORT = process.env.PORT || 5500;

const app = express();

connectDB();

app.use(express.static("public"));

app.use(logger);

app.use(cors(corsOptions));

app.use(express.json());

app.use(cookieParser());

app.use("/users", userRoutes);

app.all("*", (req, res) => {
    res.status(404);
    if(req.accepts('html')) {
        res.sendFile(path.join(__dirname, "..", "views", "404.html"));
    }
    else if(req.accepts('json')) {
        res.json({ message: "404 Not Found" });
    }
    else {
        res.send("404 Not Found");
    }
})

app.use(errorHandler);

mongoose.connection.once("open", () => {
    console.log("Connected to MongoDB");
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});

mongoose.connection.once("error", (err: any) => {
    console.log(err);
    logEvents(`${err.no}: ${err.code}\t${err.syscall}\t${err.hostname}`, 'mongoErrLog.log');
});