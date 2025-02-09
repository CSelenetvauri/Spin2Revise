document.addEventListener("DOMContentLoaded", function () {
    createWheel();

    const socket = io.connect(window.location.origin);
    const sessionCode = window.sessionCode; // Use the injected sessionCode from the template
    const userName = window.userName;       // Use the injected userName from the template

    // Emit event to join the room with the correct session code and username
    socket.emit('join_room', { session_code: sessionCode, user_name: userName });

    // Log user and session info
    console.log(`User ${userName} joined session ${sessionCode}`);
    
    // Listen for updates from other users
    socket.on('new_connection', function (data) {
        console.log("New connection:", data);
    });

    // Listen for spin events and start spinning the wheel
    socket.on('spin', function (data) {
        startSpinning(data.speed);
    
        // Update the random participant in the DOM
        const randomParticipantDiv = document.getElementById("random-participant");
        randomParticipantDiv.textContent = `${data.random_participant}`;
        randomParticipantDiv.classList.remove("hidden"); // Ensure the participant div is visible
    });

    // Listen for remove winner event to hide winner div
    socket.on('remove_winner', function () {
        const winnerWrapper = document.getElementById("winner-wrapper");
        winnerWrapper.classList.add("hidden");
    });

    socket.on('update_participants', function (data) {
        console.log("Updated participants:", data.participants);
        updateParticipantsList(data.participants);
    });
    
    // Spin button click event
    document.querySelector('.spin').addEventListener('click', function () {
        const initialSpeed = Math.random() * 8 + 12; // Slower speed for better syncing
        socket.emit('spin', { session_code: sessionCode, speed: initialSpeed });
    
        // Start the random cycle after the first spin
        socket.emit('start_random_cycle', { session_code: sessionCode });
    });

    document.getElementById("participants-btn").addEventListener("click", function () {
        document.getElementById("participants-list").classList.remove("hidden")
    });
    

    // Close winner-wrapper when clicked
    document.getElementById("participants-list").addEventListener("click", function () {
        this.classList.add("hidden");
    });

    document.getElementById("winner-wrapper").addEventListener("click", function () {
        this.classList.add("hidden");

        // Emit an event to the server to notify all users
        socket.emit('winner_removed', { session_code: sessionCode });
    });

    // Function to update the list of participants on the page
    function updateParticipantsList(participants) {
        const participantsList = document.getElementById("participants");
        participantsList.innerHTML = ''; // Clear the existing list
    
        participants.forEach(function (name) {
            const li = document.createElement("li");
            li.textContent = name;
            participantsList.appendChild(li);
        });
    }

    socket.on('random_participant_update', function (data) {
        const randomParticipantDiv = document.getElementById("random-participant");
        randomParticipantDiv.textContent = `${data.random_participant}`;
        randomParticipantDiv.classList.remove("hidden");
    });
    
    
    // Ensure winner-wrapper closes automatically after the timer ends
    function autoCloseWinnerWrapper() {
        const timerDisplay = document.getElementById('timer');
        const winnerWrapper = document.getElementById("winner-wrapper");

        if (timerDisplay.textContent === "Time's up!") {
            winnerWrapper.classList.add("hidden");
        }
    }

    setInterval(autoCloseWinnerWrapper, 1000);
});

// Determine refresh rate (60Hz, 90Hz, or 120Hz)
const refreshRate = Math.max(window.screen.refreshRate || 60, 60); // Set default as 60Hz

// Function to convert degrees to radians
function toRad(deg) {
    return deg * (Math.PI / 180);
}


const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const width = canvas.width;
const height = canvas.height;
const centerX = width / 2;
const centerY = height / 2;
const radius = width / 2;
const segmentColors = [
    "#8dec26",
    "#3d28e5",
    "#e94126", 
    "#bad7ec", 
    "#ece7e1", 
    "#ffef01", 
];

function drawWheel(ctx, items, centerX, centerY, radius) {
    const step = 360 / items.length;
    let startDeg = 0;

    for (let i = 0; i < items.length; i++, startDeg += step) {
        let endDeg = startDeg + step;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, toRad(startDeg), toRad(endDeg));
        ctx.lineTo(centerX, centerY);
        ctx.fillStyle = segmentColors[i % segmentColors.length];
        ctx.fill();

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(toRad((startDeg + endDeg) / 2));
        ctx.textAlign = "center";
        ctx.fillStyle = "#000";
        ctx.font = 'bold 24px Trebuchet MS';
        ctx.fillText(items[i], radius / 2, 0);
        ctx.restore();
    }
}

function createWheel() {
    const items = document.getElementById("items").value.split("\n").filter(item => item.trim() !== "");
    ctx.clearRect(0, 0, width, height);
    drawWheel(ctx, items, centerX, centerY, radius);
}

let currentAngle = 0;
let speed = 0;
let spinning = false;
let winner = "";
let timerInterval;

function spin() {
    const initialSpeed = Math.random() * 8 + 12; // Slower speed for better syncing
    socket.emit('spin', { speed: initialSpeed });
}

function startSpinning(initialSpeed) {
    if (spinning) {
        return;
    }

    console.log('Starting spin with speed:', initialSpeed);
    speed = initialSpeed;
    spinning = true;
    requestAnimationFrame(animate);
}

// Update animation logic to be based on refresh rate
function animate() {
    if (!spinning) return;

    currentAngle += speed;
    speed *= 0.98;

    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(toRad(currentAngle));
    ctx.translate(-centerX, -centerY);

    const items = document.getElementById("items").value.split("\n").filter(item => item.trim() !== "");
    drawWheel(ctx, items, centerX, centerY, radius);

    ctx.restore();

    if (speed < 0.01) {
        speed = 0;
        spinning = false;
        determineWinner(items, currentAngle);
    } else {
        // Adjust animation based on refresh rate for smoother experience
        let frameRateAdjustment = (refreshRate === 120) ? 0.8 : (refreshRate === 90) ? 1.0 : 1.2;
        requestAnimationFrame(() => animate(frameRateAdjustment));
    }
}

function determineWinner(items, angle) {
    const step = 360 / items.length;
    const normalizedAngle = (angle % 360 + 360) % 360;
    const winningIndex = Math.floor(normalizedAngle / step);
    winner = items[items.length - 1 - winningIndex]; // Reverse order due to rotation direction

    items.splice(items.length - 1 - winningIndex, 1); // Remove the winner
    document.getElementById("items").value = items.join("\n"); // Update the textarea

    const winnerWrapper = document.getElementById("winner-wrapper");
    const winnerDiv = document.getElementById("winner");
    winnerDiv.textContent = `${winner}`;

    if (winnerWrapper) {
        winnerWrapper.classList.remove("hidden");
    }

    // Disable spin button if no items are left
    const spinButton = document.getElementById("spin-button");
    if (items.length === 0) {
        spinButton.disabled = true; // Disable the button
        spinButton.classList.add("disabled"); // Optionally add a class for styling
    }

    startCountdown(10 * 60);
    createWheel(); // Redraw the wheel without the removed item
}


function startCountdown(duration) {
    let countdownTime = duration;
    clearInterval(timerInterval);

    timerInterval = setInterval(function() {
        const minutes = Math.floor(countdownTime / 60);
        const seconds = countdownTime % 60;

        const formattedMinutes = minutes < 10 ? "0" + minutes : minutes;
        const formattedSeconds = seconds < 10 ? "0" + seconds : seconds;

        document.getElementById('timer').textContent = formattedMinutes + ":" + formattedSeconds;

        countdownTime--;

        if (countdownTime < 0) {
            clearInterval(timerInterval);
            document.getElementById('timer').textContent = "Time's up!";
        }
    }, 1000);
}

document.getElementById("winner-wrapper").addEventListener("click", function() {
    this.classList.add("hidden");

    socket.emit('winner_removed');
});
