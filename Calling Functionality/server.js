import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const app = express();
const server = createServer(app);
const io = new Server(server);
const allusers = {}; // { username: { username, id, available, status } }

const __dirname = dirname(fileURLToPath(import.meta.url));

// Exposing public directory to outside world
app.use(express.static("public"));

// Handle incoming HTTP requests
app.get("/", (req, res) => {
    console.log("GET Request /");
    res.sendFile(join(__dirname + "/app/index.html"));
});

// Handle socket connections
io.on("connection", (socket) => {
    console.log(`Someone connected to socket server with socket id: ${socket.id}`);

    // Handle user joining
    socket.on("join-user", (username) => {
        console.log(`${username} joined socket connection`);
        allusers[username] = { username, id: socket.id, available: true, status: "Available" }; // Default: available and "Available" status
        io.emit("update-users", allusers);
    });

    // Handle user toggling availability and setting status
    socket.on("toggle-availability", ({ username, status }) => {
        if (allusers[username]) {
            allusers[username].status = status; // Update status based on user input
            console.log(`${username} is now ${status}`);
            io.emit("update-users", allusers); // Broadcast updated user list
        }
    });

    // Handle offer (check availability before proceeding)
    socket.on("offer", ({ from, to, offer }) => {
        if (allusers[to]?.status !== "Unavailable") { // If user is not explicitly "Unavailable"
            console.log(`Offer received from ${from} to ${to}`);
            io.to(allusers[to].id).emit("offer", { from, to, offer });

            // Set a timeout for 10 seconds for user2's response
            setTimeout(() => {
                // If no response from user2, inform user1
                io.to(allusers[from].id).emit("call-rejected", { from, to });
            }, 10000); // 10 seconds timeout
        } else {
            console.log(`Offer to ${to} blocked: User is unavailable`);
            io.to(allusers[from].id).emit("unavailable", to);
        }
    });

    // Handle answer (accept or reject)
    socket.on("answer", ({ from, to, answer }) => {
        console.log(`Answer received from ${to} to ${from}`);

        if (answer === "no") {
            // If user2 rejects the call, only user1 should get the rejection message
            io.to(allusers[from].id).emit("call-rejected", { from, to });
        } else {
            // If accepted, pass the answer back to user1
            io.to(allusers[from].id).emit("answer", { from, to, answer });
        }
    });

    // Handle call rejection (when user2 clicks "No")
    socket.on("call-rejected", ({ from, to }) => {
        console.log(`Call rejected by ${to}`);
        io.to(allusers[from].id).emit("call-rejected", { from, to });
    });

    // Handle end call
    socket.on("end-call", ({ from, to }) => {
        console.log(`Call ended between ${from} and ${to}`);
        io.to(allusers[to].id).emit("end-call", { from, to });
    });

    // Handle call-ended event
    socket.on("call-ended", (caller) => {
        const [from, to] = caller;
        console.log(`Call ended by ${from}`);
        io.to(allusers[from].id).emit("call-ended", caller);
        io.to(allusers[to].id).emit("call-ended", caller);
    });

    // Handle ICE candidates
    socket.on("icecandidate", (candidate) => {
        console.log("ICE candidate received:", candidate);
        socket.broadcast.emit("icecandidate", candidate);
    });

    // Handle user disconnect
    socket.on("disconnect", () => {
        const user = Object.keys(allusers).find((key) => allusers[key].id === socket.id);
        if (user) {
            delete allusers[user];
            console.log(`${user} disconnected`);
            io.emit("update-users", allusers); // Notify everyone
        }
    });
});

server.listen(8001, () => {
    console.log("Server listening on port 8001");
});
