const socket = io();

const myFace = document.querySelector(".stream__mine");
const muteBtn = document.querySelector(".stream--mute");
const cameraBtn = document.querySelector(".stream--off");
const camerasSelect = document.querySelector(".stream--cameras");
const leaveBtn = document.querySelector(".stream--leave");
const room = document.querySelector(".room");

room.classList.add("hide");

let myStream;
let muted = false;
let cameraOff = false;
let roomName;
let nickName;
let userId;
let peerConnections = new Map();

async function getCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === "videoinput");
    const currentCamera = myStream.getVideoTracks()[0];
    cameras.forEach((camera) => {
      const option = document.createElement("option");
      option.value = camera.deviceId;
      option.innerText = camera.label;
      if (currentCamera.label === camera.label) {
        option.selected = true;
      }
      camerasSelect.appendChild(option);
    });
  } catch (e) {
    console.log(e);
  }
}

async function getMedia(deviceId) {
  const initialConstrains = {
    audio: true,
    video: { facingMode: "user" },
  };
  const cameraConstrains = {
    audio: true,
    video: { deviceId: { exact: deviceId } },
  };
  try {
    myStream = await navigator.mediaDevices.getUserMedia(deviceId ? cameraConstrains : initialConstrains);
    myFace.srcObject = myStream;
    if (!deviceId) {
      await getCameras();
    }
  } catch (e) {
    console.log(e);
  }
}

function handleMuteClick() {
  myStream.getAudioTracks().forEach((track) => (track.enabled = !track.enabled));
  muteBtn.innerText = !muted ? "volume_up" : "volume_off";
  muted = !muted;
}

function handleCameraClick() {
  myStream.getVideoTracks().forEach((track) => (track.enabled = !track.enabled));
  cameraBtn.innerText = cameraOff ? "call" : "call_end";
  cameraOff = !cameraOff;
}

async function handleCameraChange() {
  const myPeerConnection = peerConnections.get(userId);
  await getMedia(camerasSelect.value);
  if (myPeerConnection) {
    const videoTrack = myStream.getVideoTracks()[0];
    const videoSender = myPeerConnection.getSenders().find((sender) => sender.track.kind === "video");
    videoSender.replaceTrack(videoTrack);
  }
}

function handleStreamLeave() {
  if (myStream) {
    myStream.getTracks().forEach((track) => track.stop());
    myStream = null;
  }
  peerConnections.forEach((connection) => {
    const peerBox = document.querySelectorAll(".stream__peer");
    peerBox.forEach((box) => {
      box.remove();
    });
    connection.close();
  });
  socket.emit("leave_room", roomName, () => {
    initRoom();
  });
}

muteBtn.addEventListener("click", handleMuteClick);
cameraBtn.addEventListener("click", handleCameraClick);
camerasSelect.addEventListener("input", handleCameraChange);
leaveBtn.addEventListener("click", handleStreamLeave);

// Welcome Form (join a room)

const welcome = document.querySelector(".welcome");
const welcomeForm = welcome.querySelector("form");

function initRoom() {
  welcome.classList.remove("hide");
  room.classList.add("hide");
  const bubbles = document.querySelector(".chat__bubbles");
  bubbles.innerHTML = "";
  const input = chatForm.querySelectorAll("input");
  input.forEach((element) => (element.value = ""));
  roomName = null;
  nickName = null;
}

async function enterRoom() {
  socket.emit("session", window.sessionStorage.getItem("userId"), (user) => {
    window.sessionStorage.setItem("userId", user.id);
    userId = user.id;
  });
  welcome.classList.add("hide");
  room.classList.remove("hide");
  await getMedia();
}

async function handleWelcomeSubmit(event) {
  event.preventDefault();
  const input = welcomeForm.querySelectorAll("input");
  roomName = input[0].value;
  nickName = input[1].value;
  if (roomName.trim() && nickName.trim()) {
    await enterRoom();
    socket.emit("join_room", roomName, nickName, (name) => {
      const roomTitle = document.querySelector(".room__name");
      roomTitle.innerText = name;
    });
  }
  input[0].value = "";
  input[1].value = "";
}

welcomeForm.addEventListener("submit", handleWelcomeSubmit);

// Chat Form

const chat = document.querySelector(".room__chat");
const chatForm = chat.querySelector("form");

function handleNotice(msg) {
  const container = document.createElement("div");
  container.className = "chat__notice";
  const line = document.createElement("p");
  line.innerText = msg;
  container.appendChild(line);
  const bubbles = document.querySelector(".chat__bubbles");
  bubbles.appendChild(container);
}

function handleBubble(obj, type = "receive") {
  const data = JSON.parse(obj);
  const bubbles = document.querySelector(".chat__bubbles");
  const bubble = document.createElement("div");
  if (type === "send") {
    bubble.className = "chat__bubble mine";
  } else {
    bubble.className = "chat__bubble other";
  }
  const info = document.createElement("div");
  info.className = "chat__info";
  const name = document.createElement("span");
  name.className = "chat__name";
  name.innerText = data.name;
  const text = document.createElement("span");
  text.className = "chat__text";
  text.innerText = data.msg;
  info.appendChild(name);
  info.appendChild(text);
  bubble.appendChild(info);
  bubbles.appendChild(bubble);
}

async function handleChatSubmit(event) {
  event.preventDefault();
  const input = chatForm.querySelector("input");
  const obj = JSON.stringify({ name: nickName, msg: input.value });
  peerConnections.forEach(async (connection) => {
    await connection.dataChannel.send(obj);
  });
  input.value = "";
  handleBubble(obj, "send");
}

chatForm.addEventListener("submit", handleChatSubmit);

// Socket Code

socket.on("welcome", async (response) => {
  const myPeerConnection = makeConnection(response.id, response.nickname);
  makeDataChannel(myPeerConnection, false);
  handleNotice(`${response.nickname} arrived!`);
  const offer = await myPeerConnection.createOffer();
  myPeerConnection.setLocalDescription(offer);
  console.log("sent the offer");
  socket.emit("offer", offer, response.id);
});

socket.on("offer", async (offer, response) => {
  const myPeerConnection = makeConnection(response.id, response.nickname);
  makeDataChannel(myPeerConnection, true);
  myPeerConnection.setRemoteDescription(offer);
  const answer = await myPeerConnection.createAnswer();
  myPeerConnection.setLocalDescription(answer);
  socket.emit("answer", answer, response.id);
});

socket.on("answer", (answer, response) => {
  const myPeerConnection = peerConnections.get(response.id);
  myPeerConnection.setRemoteDescription(answer);
});

socket.on("ice", (ice, response) => {
  const myPeerConnection = peerConnections.get(response.id);
  console.log("received candidate");
  myPeerConnection.addIceCandidate(ice);
});

socket.on("leave", (response) => {
  if (!peerConnections.has(response.id)) {
    return;
  }
  const peerBox = document.querySelector(`.stream__peer[data-id="${response.id}"]`);
  if (peerBox) {
    peerBox.remove();
  }
  peerConnections.get(response.id).close();
  peerConnections.delete(response.id);
  handleNotice(`${response.nickname} left 😪`);
});

socket.on("reject", (response) => {
  if (myStream) {
    myStream.getTracks().forEach((track) => track.stop());
    myStream = null;
  }
  handleDialog("The chat room is full.");
  initRoom();
  if (!peerConnections.has(response.id)) {
    return;
  }
  peerConnections.get(response.id).close();
  peerConnections.delete(response.id);
});

socket.on("change_room", (rooms) => {
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

socket.on("change_nickname", (user) => {
  if (user) {
    handleNotice(`${user.oldNickname} -> ${user.nickname} changed`);
  }
});

socket.on("count_user", (count) => {
  const roomCount = document.querySelector(".room__count");
  roomCount.innerText = `(${count})`;
});

// RTC Code

function makeConnection(peerId, nickname) {
  const myPeerConnection = new RTCPeerConnection({
    iceServers: [
      {
        urls: [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302",
          "stun:stun2.l.google.com:19302",
          "stun:stun3.l.google.com:19302",
          "stun:stun4.l.google.com:19302",
        ],
      },
    ],
  });
  peerConnections.set(peerId, myPeerConnection);
  myPeerConnection.addEventListener("icecandidate", (event) => {
    handleIce(event, peerId);
  });
  myPeerConnection.addEventListener("track", (event) => {
    handleTrack(event, peerId, nickname);
  });
  myStream.getTracks().forEach((track) => myPeerConnection.addTrack(track, myStream));
  return myPeerConnection;
}

function makeDataChannel(myPeerConnection, isOffer) {
  if (!isOffer) {
    myPeerConnection.dataChannel = myPeerConnection.createDataChannel("chat");
    myPeerConnection.dataChannel.addEventListener("message", (event) => handleBubble(event.data));
    console.log("made data channel");
  } else {
    myPeerConnection.addEventListener("datachannel", (event) => {
      myPeerConnection.dataChannel = event.channel;
      myPeerConnection.dataChannel.addEventListener("message", (event) => handleBubble(event.data));
    });
  }
}

function handleIce(data, peerId) {
  console.log("sent candidate");
  socket.emit("ice", data.candidate, peerId);
}

function handleTrack(data, peerId, nickname) {
  if (data.track.kind !== "video") {
    return;
  }
  const peerSection = document.querySelector(".stream__peers");
  const peerBox = document.createElement("div");
  peerBox.className = "stream__peer";
  peerBox.dataset.id = peerId;
  const peerFace = document.createElement("video");
  peerFace.className = "stream__other";
  peerFace.srcObject = data.streams[0];
  peerFace.autoplay = true;
  peerFace.playsinline = true;
  const peerName = document.createElement("span");
  peerName.className = "other__name";
  peerName.innerText = nickname;
  peerBox.appendChild(peerFace);
  peerBox.appendChild(peerName);
  peerSection.appendChild(peerBox);
}

// modal code
const modal = document.querySelector(".modal");
const modalOpenBtn = document.querySelector(".modal--open");
const modalCloseBtn = document.querySelector(".modal--close");
const overlay = document.querySelector(".overlay");

function handleModalSubmit(event) {
  event.preventDefault();
  const modalInput = modal.querySelector("form input");
  if (modalInput.value.trim() === "") {
    return;
  }
  socket.emit("change_nickname", modalInput.value, (response) => {
    nickName = response.nickname;
  });
  modalInput.value = "";
  handleModalClick();
}

function handleModalClick() {
  modal.classList.toggle("hide");
  overlay.classList.toggle("hide");
  const modalForm = modal.querySelector("form");
  const modalBtn = modalForm.querySelector("button");
  if (modal.classList.contains("hide")) {
    modalBtn.removeEventListener("click", handleModalSubmit);
  } else {
    modalBtn.addEventListener("click", handleModalSubmit);
  }
}

modalOpenBtn.addEventListener("click", handleModalClick);
modalCloseBtn.addEventListener("click", handleModalClick);
overlay.addEventListener("click", handleModalClick);

// dialog code

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handleDialog(msg) {
  const dialog = document.querySelector(".message");
  const text = dialog.querySelector(".subtitle");
  text.innerText = msg;
  dialog.classList.remove("hide");
  await sleep(6000);
  dialog.classList.add("hide");
}
