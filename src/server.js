import http from "http";
import SocketIo from "socket.io";
import crypto from "crypto";
import express from "express";

const app = express();

app.set("view engine", "pug");
app.set("views", __dirname + "/views");
app.use("/public", express.static(__dirname + "/public"));
app.get("/", (_, res) => res.render("home"));
app.get("/*", (_, res) => res.redirect("/"));

const handleListen = () => console.log(`Listening on http://localhost:3000`);

const httpServer = http.createServer(app);
const wsServer = SocketIo(httpServer);

const maximum = 4;
const users = new Map();

function getRandomId() {
  return crypto.randomBytes(16).toString("hex");
}

function getRoomCount(room) {
  let count = 0;
  users.forEach((user) => {
    if (user.room === room) {
      count++;
    }
  });
  return count;
}

wsServer.on("connection", (socket) => {
  socket.on("disconnect", () => {
    const user = users.get(socket.data.userId);
    if (user) {
      socket.leave(user.room);
      users.delete(socket.data.userId);
      socket.to(user.room).emit("leave", user);
    }
  });
  socket.on("session", (id, done) => {
    let user;
    if (users.has(id)) {
      user = users.get(id);
    } else {
      user = { id: getRandomId() };
      users.set(user.id, user);
    }
    socket.data.userId = user.id;
    done({ id: user.id });
  });
  socket.on("join_room", async (roomName, nickName, done) => {
    let user = users.get(socket.data.userId);
    if (getRoomCount(roomName) === maximum) {
      socket.emit("reject", user);
      return;
    }
    user.nickname = nickName;
    user.room = roomName;
    users.set(socket.data.userId, user);
    socket.join(roomName);
    done(roomName);
    socket.to(roomName).emit("welcome", user);
  });
  socket.on("offer", async (offer, userId) => {
    const user = users.get(socket.data.userId);
    const target = (await wsServer.fetchSockets()).find((_socket) => _socket.data.userId === userId);
    socket.to(target.id).emit("offer", offer, user);
  });
  socket.on("answer", async (answer, userId) => {
    const user = users.get(socket.data.userId);
    const target = (await wsServer.fetchSockets()).find((_socket) => _socket.data.userId === userId);
    socket.to(target.id).emit("answer", answer, user);
  });
  socket.on("ice", async (ice, userId) => {
    const user = users.get(socket.data.userId);
    const target = (await wsServer.fetchSockets()).find((_socket) => _socket.data.userId === userId);
    socket.to(target.id).emit("ice", ice, user);
  });
  socket.on("leave-room", (roomName, done) => {
    const user = users.get(socket.data.userId);
    if (user) {
      socket.leave(roomName);
      users.delete(socket.data.userId);
      socket.to(roomName).emit("leave", user);
    }
    done();
  });
});

httpServer.listen(3000, handleListen);
