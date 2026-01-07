// Firebase modules
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCCmwlaccAVrpH28cOsAnHAahfJec4Tgyc",
    authDomain: "shareplate-b6397.firebaseapp.com",
    projectId: "shareplate-b6397",
    storageBucket: "shareplate-b6397.firebasestorage.app",
    messagingSenderId: "557590065392",
    appId: "1:557590065392:web:bcb9d10f40de8b9c2c1235",
    measurementId: "G-DEL9JRXB5X"
};

// Initialize Firebase services
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const panel = document.getElementById("panel");
const mini = document.getElementById("mini");
const toggleBtn = document.getElementById("toggleBtn");
const mainBtn = document.getElementById("mainBtn");
const title = document.getElementById("title");
const usernameContainer = document.getElementById("usernameContainer");
const usernameInput = document.getElementById("username");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const errorMessage = document.getElementById("errorMessage");
const successMessage = document.getElementById("successMessage");

let isSignup = false;
let selectedRole = "Restaurant";

// Role Selection
document.querySelectorAll(".role").forEach(role => {
    role.onclick = () => {
        document.querySelectorAll(".role").forEach(r => r.classList.remove("active"));
        role.classList.add("active");
        selectedRole = role.dataset.role;
    };
});

// Toggle Between Sign In and Sign Up
toggleBtn.onclick = () => {
    clearMessages();

    if (!isSignup) {
        // Switch to Sign Up
        panel.classList.remove("move-left");
        panel.classList.add("move-right");
        mini.classList.add("move-left");
        title.textContent = "Sign Up";
        mainBtn.textContent = "Create Account";
        toggleBtn.textContent = "Sign In ‹‹";
        usernameContainer.classList.remove("hidden-username");
    } else {
        // Switch to Login
        panel.classList.remove("move-right");
        panel.classList.add("move-left");
        mini.classList.remove("move-left");
        title.textContent = "Login";
        mainBtn.textContent = "Sign In";
        toggleBtn.textContent = "Sign Up ››";
        usernameContainer.classList.add("hidden-username");
    }
    isSignup = !isSignup;
};

// Main Authentication Button
mainBtn.onclick = async () => {
    clearMessages();

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    const username = usernameInput.value.trim();

    // Validation
    if (isSignup && !username) {
        showError("Please enter your name");
        return;
    }
    if (!email) {
        showError("Please enter your email");
        return;
    }
    if (!password) {
        showError("Please enter your password");
        return;
    }
    if (password.length < 6) {
        showError("Password must be at least 6 characters");
        return;
    }

    // Disable button and show loading
    mainBtn.disabled = true;
    const originalText = mainBtn.textContent;
    mainBtn.innerHTML = '<span class="spinner"></span>';

    try {
        if (isSignup) {
            // 1. Sign Up using Firebase Auth
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // 2. Update user profile with name
            await updateProfile(user, {
                displayName: username
            });

            // 3. Save user data and role securely to Firestore
            await setDoc(doc(db, "users", user.uid), {
                uid: user.uid,
                name: username,
                email: email,
                role: selectedRole,
                createdAt: new Date().toISOString(),
            });

            showSuccess("Account created successfully! Redirecting...");

            // === Set the LocalStorage key! ===
            localStorage.setItem("userUid", user.uid);
            localStorage.setItem("loggedIn", "true");
            localStorage.setItem("loggedInUser", username);
            localStorage.setItem("loggedInRole", selectedRole);

            // Redirect after 1 second
            setTimeout(() => {
                window.location.href = "index.html";
            }, 1000);

        } else {
            // Sign In
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Fetch the correct role from the database instead of relying on the button
            let finalRole = selectedRole;

            try {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                if (userDoc.exists()) {
                    finalRole = userDoc.data().role;
                }
            } catch (e) {
                console.log("Could not fetch role from DB, using selected button.");
            }

            showSuccess("Login successful! Redirecting...");

            // === Set the LocalStorage key! ===
            localStorage.setItem("userUid", user.uid);
            localStorage.setItem("loggedIn", "true");
            localStorage.setItem("loggedInUser", user.displayName || email);
            localStorage.setItem("loggedInEmail", email);
            localStorage.setItem("loggedInRole", finalRole);

            // Redirect after 1 second
            setTimeout(() => {
                window.location.href = "index.html";
            }, 1000);
        }

    } catch (error) {
        console.error("Authentication error:", error);

        let errorMsg = "An error occurred. Please try again.";

        if (error.code === 'auth/email-already-in-use') {
            errorMsg = "This email is already registered. Please sign in.";
        } else if (error.code === 'auth/invalid-email') {
            errorMsg = "Invalid email address.";
        } else if (error.code === 'auth/weak-password') {
            errorMsg = "Password is too weak. Use at least 6 characters.";
        } else if (error.code === 'auth/user-not-found') {
            errorMsg = "No account found with this email.";
        } else if (error.code === 'auth/wrong-password') {
            errorMsg = "Incorrect password.";
        } else if (error.code === 'auth/invalid-credential') {
            errorMsg = "Invalid email or password.";
        } else if (error.code === 'auth/too-many-requests') {
            errorMsg = "Too many attempts. Please try again later.";
        }

        showError(errorMsg);

    } finally {
        mainBtn.disabled = false;
        mainBtn.textContent = originalText;
    }
};

// Helper Functions
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.add("show");
    successMessage.classList.remove("show");
}

function showSuccess(message) {
    successMessage.textContent = message;
    successMessage.classList.add("show");
    errorMessage.classList.remove("show");
}

function clearMessages() {
    errorMessage.classList.remove("show");
    successMessage.classList.remove("show");
}

// Allow Enter key to submit
[emailInput, passwordInput, usernameInput].forEach(input => {
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            mainBtn.click();
        }
    });
});