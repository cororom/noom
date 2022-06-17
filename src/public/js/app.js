const socket = io();

const welcome = document.getElementById("welcome");
const form = welcome.querySelector("form");
const room = document.getElementById("room");

room.hidden = true;

let roomName, nickName;

function showAlert(msg) {
  alert(msg);
}

function checkBlank(string) {
  if (typeof string === "string" && string.trim().length === 0) {
    return true;
  }
  return false;
}

function addMessage(message) {
  const ul = room.querySelector("ul");
  const li = document.createElement("li");
  li.innerText = message;
  ul.appendChild(li);
}

function handleMessageSubmit(event) {
  event.preventDefault();
  const input = room.querySelector("#msg input");
  const value = input.value;
  socket.emit("new_message", value, roomName, () => {
    addMessage(`You: ${value}`);
  });
  input.value = "";
}

function handleNicknameSubmit(event) {
  event.preventDefault();
  const input = room.querySelector("#name input");
  socket.emit("nickname", input.value);
  input.value = "";
}

function showRoom() {
  welcome.hidden = true;
  room.hidden = false;
  const h3 = room.querySelector("h3");
  h3.innerText = `Room ${roomName}`;
  const msgForm = room.querySelector("#msg");
  const nameForm = room.querySelector("#name");
  msgForm.addEventListener("submit", handleMessageSubmit);
  nameForm.addEventListener("submit", handleNicknameSubmit);
}

function handleRoomSubmit(event) {
  event.preventDefault();
  const roomnameInput = form.querySelector("#roomname");
  const nicknameInput = form.querySelector("#nickname");
  const checkRoomname = checkBlank(roomnameInput.value);
  if (checkRoomname) {
    showAlert("Please check the blanks in roomname.");
    return false;
  }
  const checkNickname = checkBlank(nicknameInput.value);
  if (checkNickname) {
    showAlert("Please check the blanks in nickname.");
    return false;
  }
  socket.emit("enter_room", roomnameInput.value, nicknameInput.value, showRoom);
  roomName = roomnameInput.value;
  nickName = nicknameInput.value;
  roomnameInput.value = "";
  nicknameInput.value = "";
}

form.addEventListener("submit", handleRoomSubmit);

socket.on("welcome", (user) => {
  addMessage(`${user} arrived!`);
});

socket.on("bye", (left) => {
  addMessage(`${left} left 😪`);
});

socket.on("new_message", addMessage);

socket.on("room_change", (rooms) => {
  const roomList = welcome.querySelector("ul");
  roomList.innerHTML = "";
  if (rooms.length === 0) {
    return;
  }
  rooms.forEach((room) => {
    const li = document.createElement("li");
    li.innerText = room;
    roomList.appendChild(li);
  });
});
