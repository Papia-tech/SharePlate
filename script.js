let net;

// Load the ML model once when the app starts
async function loadMLModel() {
    console.log('Loading ML model...');
    net = await mobilenet.load();
    console.log('Model loaded successfully!');
}
loadMLModel();

// FIREBASE FUNCTIONS
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, onSnapshot, query, where, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// FIREBASE CONFIGURATION
const firebaseConfig = {
    apiKey: "AIzaSyCCmwlaccAVrpH28cOsAnHAahfJec4Tgyc",
    authDomain: "shareplate-b6397.firebaseapp.com",
    projectId: "shareplate-b6397",
    storageBucket: "shareplate-b6397.firebasestorage.app",
    messagingSenderId: "557590065392",
    appId: "1:557590065392:web:bcb9d10f40de8b9c2c1235",
    measurementId: "G-DEL9JRXB5X"
};

// INITIALIZE APP & DATABASE
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const listingsRef = collection(db, "listings");

// CHECK LOGIN STATUS
const isLoggedIn = localStorage.getItem("loggedIn");
// Change 'const' to 'let' so we can update this value later
let currentUser = localStorage.getItem("loggedInUser");
const userRole = localStorage.getItem("loggedInRole");

// Edit State Variables
let isEditing = false;
let editDocId = null;
let cachedMyData = []; // Store data locally for Dashboard (Restaurant listings OR NGO claims)
let cachedBrowseData = []; // Store active listings for filtering
let currentRating = 0;
let currentRatingDocId = null;

// Filter State
let currentFilterType = "All";

if (!isLoggedIn) {
    window.location.href = "login.html";
}

// =========================================
// === 4. HELPER: CONVERT IMAGE TO STRING ===
// =========================================
const convertBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const fileReader = new FileReader();
        fileReader.readAsDataURL(file);

        fileReader.onload = () => {
            resolve(fileReader.result);
        };

        fileReader.onerror = (error) => {
            reject(error);
        };
    });
};

// =========================================
// === CUSTOM ALERT/CONFIRM HANDLERS ===
// =========================================
window.showCustomAlert = function (message) {
    const toast = document.getElementById('customToast');
    if (!toast) return;

    toast.textContent = message;
    toast.classList.remove('hidden');
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
        // Hide after transition
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 500);
    }, 3000); // Display for 3 seconds
}

let confirmResolver = null;

window.showCustomConfirm = function (message) {
    const modal = document.getElementById('customConfirmModal');
    const msgElement = document.getElementById('confirmMessage');

    msgElement.textContent = message;
    modal.classList.remove('hidden');

    return new Promise((resolve) => {
        confirmResolver = resolve;
    });
}

// Event listeners for the custom modal buttons (outside of showCustomConfirm)
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('customConfirmModal');
    const okBtn = document.getElementById('confirmOK');
    const cancelBtn = document.getElementById('confirmCancel');

    if (okBtn) {
        okBtn.onclick = () => {
            modal.classList.add('hidden');
            if (confirmResolver) {
                confirmResolver(true);
                confirmResolver = null;
            }
        };
    }
    if (cancelBtn) {
        cancelBtn.onclick = () => {
            modal.classList.add('hidden');
            if (confirmResolver) {
                confirmResolver(false);
                confirmResolver = null;
            }
        };
    }
});

// =========================================
// === UI HELPER: SHOW FILENAME ON SELECT ===
// =========================================
window.updateFileName = function (input) {
    const display = document.getElementById("file-name-display");
    if (input.files && input.files.length > 0) {
        // do not use second brackets in print.
        display.textContent = input.files[0].name;
        display.style.color = "#2d7a4d"; // Turn text green
        display.style.fontWeight = "600";
    } else {
        // do not use second brackets in print.
        display.textContent = "Upload Food Image (Optional)";
        display.style.color = "#666";
    }
}

// =========================================
// === MAP/LOCATION UTILITY FUNCTION ===
// =========================================
// Modified to accept optional mapIframeId
window.updateMap = function (address, mapIframeId = 'restaurant-map') {
    const mapIframe = document.getElementById(mapIframeId);
    if (mapIframe) {
        // Encode the address for the Google Maps query URL
        const encodedAddress = encodeURIComponent(address);
        // Use a generic Google Maps embed URL as a placeholder for dynamic address lookup
        mapIframe.src = `https://maps.google.com/maps?q=$?q=$${encodedAddress}&t=&z=13&ie=UTF8&iwloc=&output=embed`;
    }
}

// getCurrentLocation to perform reverse geocoding via Nominatim
window.getCurrentLocation = function () {
    const addressInput = document.getElementById('restaurant-address');
    const statusMessage = document.getElementById('location-status');

    if (navigator.geolocation) {
        statusMessage.textContent = "Getting location...";

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;

                // Public reverse geocoding service (Nominatim/OpenStreetMap)
                const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;

                try {
                    const response = await fetch(nominatimUrl);
                    const data = await response.json();

                    let areaName = "Address not found";

                    if (data.address) {
                        // Prioritize known area fields for a cleaner "area wise" output
                        const address = data.address;
                        areaName = [
                            address.road,
                            address.suburb || address.neighbourhood,
                            address.village || address.town || address.city,
                            address.state,
                            address.postcode
                        ].filter(Boolean).join(', ');

                        // Fallback to display name if the constructed address is too specific or missing key components
                        if (areaName.length < 15 || areaName.includes('undefined')) {
                            areaName = data.display_name;
                        }
                    }

                    addressInput.value = areaName;
                    updateMap(areaName);
                    statusMessage.textContent = `Location set to area: ${areaName.substring(0, 50)}...`;

                } catch (e) {
                    console.error("Reverse Geocoding Error:", e);
                    const simulatedAddress = `Approximate location: Lat ${lat.toFixed(4)}, Lng ${lng.toFixed(4)}`;
                    addressInput.value = simulatedAddress;
                    updateMap(simulatedAddress);
                    statusMessage.textContent = "Could not get full address from service. Showing coordinates.";
                }
            },
            (error) => {
                let msg = "Geolocation failed: ";
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        msg += "User denied the request for Geolocation. Please allow location access.";
                        break;
                    case error.POSITION_UNAVAILABLE:
                        msg += "Location information is unavailable.";
                        break;
                    case error.TIMEOUT:
                        msg += "The request to get user location timed out.";
                        break;
                    case error.UNKNOWN_ERROR:
                        msg += "An unknown error occurred.";
                        break;
                }
                statusMessage.textContent = msg;
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    } else {
        statusMessage.textContent = "Geolocation is not supported by this browser.";
    }
}

async function verifyFoodFreshness(imageElement, userInputName) {
    if (!net) return true;

    const predictions = await net.classify(imageElement);
    console.log("AI Analysis:", predictions);
    
    const input = userInputName.toLowerCase();

    // 1. DANGER ZONE: Labels that often indicate non-fresh or non-food items
    // If the AI is confident about these, we reject the food.
    const spoiledKeywords = ['fungus', 'mold', 'bacteria', 'decay', 'rotten', 'trash', 'garbage', 'scavenger'];
    
    const looksSpoiled = predictions.some(p => 
        spoiledKeywords.some(key => p.className.toLowerCase().includes(key)) && p.probability > 0.10
    );

    if (looksSpoiled) {
        console.log("Freshness Check: Failed (Potential spoilage detected)");
        return false; 
    }

    // 2. SYNONYM MAP (To keep your "Name Match" feature working)
    const synonyms = {
        'rice': ['rice', 'boiled rice', 'paddy', 'grain', 'risotto'],
        'roti': ['bread', 'dough', 'flatbread', 'naan'],
        'curry': ['stew', 'soup', 'pot', 'gravy', 'sauce'],
        'momo': ['dumpling', 'dough', 'bun'],
        'dal': ['soup', 'stew', 'lentil']
    };

    let acceptedLabels = [input, 'food', 'dish', 'meal', 'cuisine', 'plate', 'tableware'];
    for (let key in synonyms) {
        if (input.includes(key)) acceptedLabels = acceptedLabels.concat(synonyms[key]);
    }

    // 3. FINAL VERIFICATION
    // Must be recognized as food/user-input AND not be in the "Danger Zone"
    const isFreshFood = predictions.some(p => 
        acceptedLabels.some(label => p.className.toLowerCase().includes(label)) && p.probability > 0.05
    );

    return isFreshFood;
}

// =========================================
// === 5. LISTING FUNCTION ===
// =========================================
window.addPost = async function () {
    const title = document.getElementById("dish-name").value;
    const qty = document.getElementById("portions-available").value;
    const restName = document.getElementById("restaurant-name").value;

    // Get Country Code and Phone Number
    const countryCode = document.getElementById("country-code-select").value;
    const phoneNumber = document.getElementById("restaurant-phone").value.trim();
    const fullPhoneNumber = countryCode + " " + phoneNumber;

    const restAddr = document.getElementById("restaurant-address").value;
    const desc = document.getElementById("food-description").value;
    const type = document.getElementById("food-type").value; // Get the selected type
    const fileInput = document.getElementById("food-image-upload");

    // Basic Validation
    if (!title || !qty || !restName) {
        showCustomAlert("Please fill in the required fields (Name, Quantity, Restaurant Name).");
        return;
    }

    // Phone Number Validation
    const phoneDigits = phoneNumber.replace(/\D/g, '');
    if (phoneDigits.length !== 10) {
        showCustomAlert("Please enter a valid 10-digit phone number.");
        return;
    }


    const createBtn = document.getElementById("modal-submit-btn"); // Changed selector to target the modal button
    const originalBtnText = isEditing ? "Update Listing" : "Post New Listing";
    createBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
    createBtn.disabled = true;

    try {
        let imageString = "";

        // --- UPDATED IMAGE & AI VERIFICATION BLOCK ---
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];

            // 1. Check file size
            if (file.size > 800 * 1024) {
                showCustomAlert("Image is too large! Max 800KB.");
                createBtn.innerHTML = originalBtnText;
                createBtn.disabled = false;
                return;
            }

            // 2. Convert to Base64
            imageString = await convertBase64(file);

            // 3. Create a temporary image for AI analysis
            const tempImg = new Image();

            // 4. Wait for the image to fully LOAD and DECODE
            await new Promise((resolve, reject) => {
                tempImg.onload = resolve;
                tempImg.onerror = reject;
                tempImg.src = imageString;
            });

            if ('decode' in tempImg) {
                await tempImg.decode();
            }

            // 5. Run the AI check
            const isValidFood = await verifyFoodFreshness(tempImg, title);

            if (!isValidFood) {
                showCustomAlert(`⚠️ AI Check Failed: The image does not look like "${title}". Please upload a matching photo.`);
                // ... reset button logic ...
                return;
            }
        }
        // --- END OF UPDATED BLOCK ---
        // ... rest of the firebase addDoc code ...

        // Get Current Time and Date
        const now = new Date();
        const uploadTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const uploadDate = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });


        const dataPayload = {
            title: title,
            quantity: qty,
            // Use the current upload time as the pickupTime
            pickupTime: uploadTime,
            // Store the date separately for display/sorting
            uploadDate: uploadDate,
            dateTime: new Date().toISOString().split('T')[0],
            status: "Active",
            tags: [type], // Use the selected type
            restaurantName: restName,
            restaurantPhone: fullPhoneNumber, // Save combined phone number
            restaurantAddress: restAddr,
            description: desc,
            createdBy: currentUser,
            createdAt: Date.now()
        };

        // Only update image if a new one was uploaded
        if (imageString) {
            dataPayload.imageUrl = imageString;
        }

        if (isEditing && editDocId) {
            // UPDATE EXISTING DOC
            const docRef = doc(db, "listings", editDocId);
            await updateDoc(docRef, dataPayload);
            showCustomAlert("Listing updated successfully!");
            cancelEdit(); // Reset form and close modal
        } else {
            // CREATE NEW DOC
            if (!imageString) dataPayload.imageUrl = ""; // Ensure field exists
            await addDoc(listingsRef, dataPayload);
            showCustomAlert("Listing posted successfully!");
            clearForm();
            toggleCreateModal(false); // Close modal on success
        }

    } catch (e) {
        console.error("Error adding/updating document: ", e);
        showCustomAlert("Error: Listing failed.");
    } finally {
        createBtn.innerHTML = isEditing ? '<i class="fa-solid fa-pen"></i> Update Listing' : '<i class="fa-solid fa-plus"></i> Post New Listing';
        createBtn.disabled = false;
    }
}

// Helper to clear form
function clearForm() {
    document.getElementById("dish-name").value = '';
    document.getElementById("portions-available").value = '';
    document.getElementById("restaurant-name").value = '';

    // Reset phone fields
    document.getElementById("country-code-select").value = '+91';
    document.getElementById("restaurant-phone").value = '';

    document.getElementById("restaurant-address").value = '';
    document.getElementById("food-description").value = '';
    document.getElementById("food-image-upload").value = '';

    // Reset map and status
    updateMap('1600 Amphitheatre Parkway, Mountain View, CA');
    document.getElementById('location-status').textContent = "Enter address or use location button.";


    const display = document.getElementById("file-name-display");
    display.textContent = "Upload Food Image (Optional)";
    display.style.color = "#666";
}

// =========================================
// === EDITING FUNCTIONS ===
// =========================================
window.editPost = function (id) {
    // Find in cachedMyData (used for Restaurant listings)
    const item = cachedMyData.find(i => i.id === id);
    if (!item) return;

    // Populate fields
    document.getElementById("restaurant-name").value = item.restaurantName;

    // Split the saved phone number back into code and number
    const fullPhone = item.restaurantPhone || '+91 '; // Default if missing
    const parts = fullPhone.split(' ');
    const code = parts[0];
    const number = parts.slice(1).join(' '); // Rejoin remaining parts for the number

    // Ensure set a valid code, otherwise use default
    const codeSelect = document.getElementById("country-code-select");
    if ([...codeSelect.options].map(o => o.value).includes(code)) {
        codeSelect.value = code;
    } else {
        codeSelect.value = '+91'; // Default to India if code is unrecognized
    }
    document.getElementById("restaurant-phone").value = number.trim();


    document.getElementById("dish-name").value = item.title;
    document.getElementById("portions-available").value = item.quantity;
    document.getElementById("food-type").value = item.tags ? item.tags[0] : 'Vegetarian';
    const address = item.restaurantAddress;
    document.getElementById("restaurant-address").value = address;
    document.getElementById("food-description").value = item.description || '';

    // Update map with existing address
    updateMap(address);

    // Set Edit Mode
    isEditing = true;
    editDocId = id;

    document.getElementById('modal-title').textContent = "Edit Food Listing";
    const createBtn = document.getElementById('modal-submit-btn');
    createBtn.innerHTML = '<i class="fa-solid fa-pen"></i> Update Listing';
    document.getElementById('cancel-edit-btn').classList.remove('hidden');
    document.getElementById('location-status').textContent = "Location loaded from listing details.";

    toggleCreateModal(true);
}

window.cancelEdit = function () {
    isEditing = false;
    editDocId = null;
    clearForm();

    // Reset Modal UI
    document.getElementById('modal-title').textContent = "Create Food Listing";
    const createBtn = document.getElementById('modal-submit-btn');
    createBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Post New Listing';
    document.getElementById('cancel-edit-btn').classList.add('hidden');

    // Close the modal
    toggleCreateModal(false);
}

// =========================================
// === NGO CLAIM & PICKUP FUNCTIONALITY ===
// =========================================
window.claimFood = async function (docId) {
    // First Confirmation: Are you sure you want to claim?
    if (!await showCustomConfirm("Are you sure you want to claim this food?")) return;

    try {
        const docRef = doc(db, "listings", docId);
        await updateDoc(docRef, {
            status: "Claimed",
            claimedBy: currentUser,
            claimedAt: Date.now()
        });

        // Second Confirmation: Ask if user wants to go to Dashboard or stay on Browse.
        const stayOnBrowse = await showCustomConfirm("Claim successful! Would you like to view your claims on the Dashboard now?");

        if (stayOnBrowse) {
            // User clicked 'OK' -> Go to Dashboard
            window.showView('dashboard');
        } else {
            // User clicked 'CANCEL' -> Stay on current view (Browse)
        }

    } catch (e) {
        console.error("Error claiming:", e);
        showCustomAlert("Error: Claim failed.");
    }
}

// PICK UP FUNCTION
window.pickupFood = async function (docId) {
    if (!await showCustomConfirm("Confirm pickup? This will mark the food as distributed.")) return;

    try {
        const docRef = doc(db, "listings", docId);
        await updateDoc(docRef, {
            status: "Completed",
            completedAt: Date.now(),
            rating: null,
            ratedBy: null,
            ratedAt: null
        });

        // Open rating popup AFTER pickup
        openRatingModal(docId);

        showCustomAlert("Pickup confirmed! Thank you for reducing waste.");
    } catch (e) {
        console.error("Error updating pickup:", e);
        showCustomAlert("Error confirming pickup.");
    }
}

// =========================================
// === BROWSE MAP MODAL FUNCTIONS ===
// =========================================
window.showRestaurantMap = function (restaurantName, address) {
    document.getElementById('browseMapTitle').textContent = `Location for ${restaurantName}`;
    document.getElementById('browseMapAddress').textContent = address;
    // Update the embedded map iframe using the existing updateMap logic
    updateMap(address, 'browse-restaurant-map');
    // Show the modal
    toggleBrowseMapModal(true);
}

window.toggleBrowseMapModal = function (show) {
    const modalOverlay = document.getElementById('browseMapModal');
    if (show) {
        modalOverlay.classList.remove('hidden');
    } else {
        modalOverlay.classList.add('hidden');
    }
}


// =========================================
// === 6. DATA LISTENERS (Real-Time Updates) ===
// =========================================

// LISTENER 1: DASHBOARD (Role Based)
if (userRole === 'Restaurant') {
    const myQuery = query(listingsRef, where("createdBy", "==", currentUser));
    onSnapshot(myQuery, (snapshot) => {
        const myData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        cachedMyData = myData; // Save for editing and deletion (Restaurant)
        renderDashboardItems(myData);
        updateDashboardStats(myData);
    });
} else if (userRole === 'NGO') {
    // Listener for Claims made by this NGO
    const ngoQuery = query(listingsRef, where("claimedBy", "==", currentUser));
    onSnapshot(ngoQuery, (snapshot) => {
        const myClaims = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        cachedMyData = myClaims; // Save for deletion (NGO claims)
        renderNgoClaims(myClaims);
        updateNgoStats(myClaims);
    });
}

// LISTENER 2: BROWSE PAGE (Shows ALL Active listings)
const browseQuery = query(listingsRef, where("status", "==", "Active"));
onSnapshot(browseQuery, (snapshot) => {
    const allActiveData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    cachedBrowseData = allActiveData; // Cache for Search/Filter and NGO cancellation
    filterBrowse();
});

// =========================================
// === 7. FILTER & SEARCH LOGIC ===
// =========================================
window.setFilter = function (filterType, btnElement) {
    currentFilterType = filterType;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.classList.add('inactive');
    });
    btnElement.classList.remove('inactive');
    btnElement.classList.add('active');
    filterBrowse();
}

window.filterBrowse = function () {
    const searchTerm = document.getElementById("searchInput").value.toLowerCase();

    const filteredData = cachedBrowseData.filter(item => {
        const matchesSearch = item.title.toLowerCase().includes(searchTerm) || item.restaurantName.toLowerCase().includes(searchTerm);
        let matchesFilter = true;
        if (currentFilterType !== "All") {
            matchesFilter = item.tags && item.tags.includes(currentFilterType);
        }
        return matchesSearch && matchesFilter;
    });
    renderBrowseCards(filteredData);
}

// =========================================
// === 8. RENDER FUNCTIONS ===
// =========================================
function renderDashboardItems(data) {
    const container = document.getElementById("listingContainer");
    if (!container) return;
    container.innerHTML = "";

    if (data.length === 0) {
        container.innerHTML = "<p>No active listings yet. Create one above!</p>";
        return;
    }

    data.sort((a, b) => b.createdAt - a.createdAt);

    data.forEach((item) => {
        let ratingHtml = "";
        if (item.rating) {
            ratingHtml = `
        <div class="rating-display">
            ${"★".repeat(item.rating)}${"☆".repeat(5 - item.rating)}
        </div>
    `;
        }

        let badgeClass = item.status === "Active" ? "status-active" : item.status === "Claimed" ? "status-claimed" : "status-completed";
        let thumb = item.imageUrl || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100&h=100&fit=crop";

        // Show "Claimed & Picked Up" text if completed
        let statusText = item.status;
        if (item.status === "Completed") statusText = "Claimed & Picked Up";

        // Determine which buttons to show
        let actionButtons = '';
        let disabledClass = '';

        if (item.status === 'Active') {
            actionButtons = `
                        <button class="action-btn btn-edit" onclick="editPost('${item.id}')">Edit</button>
                        <button class="action-btn btn-cancel" onclick="deletePost('${item.id}')">Delete</button>
                    `;
        } else if (item.status === 'Claimed') {
            // If claimed, buttons are disabled but visible
            disabledClass = 'btn-disabled';
            actionButtons = `
                        <button class="action-btn btn-edit ${disabledClass}" onclick="editPost('${item.id}')">Edit</button>
                        <button class="action-btn btn-cancel ${disabledClass}" onclick="deletePost('${item.id}')">Delete</button>
                    `;
        } else if (item.status === 'Completed') {
            // If completed, buttons are disabled but visible
            disabledClass = 'btn-disabled';
            actionButtons = `
                        <button class="action-btn btn-edit ${disabledClass}" onclick="editPost('${item.id}')">Edit</button>
                        <button class="action-btn btn-cancel ${disabledClass}" onclick="deletePost('${item.id}')">Delete</button>
                     `;
        }

        container.innerHTML += `
                <div class="listing-card">
                    <img src="${thumb}" class="list-thumb">
                    <div class="card-info">
                        <span class="restaurant-label">${item.restaurantName}</span>
                        <h3>${item.title}<span class="status-badge ${badgeClass}">${statusText}</span></h3>${ratingHtml}

                        <div class="card-meta">
                            <span><i class="fa-regular fa-user"></i> ${item.quantity}</span>
                            <span><i class="fa-regular fa-clock"></i> ${item.pickupTime} (${item.uploadDate})</span>
                        </div>
                    </div>
                    <div class="card-actions">
                        ${actionButtons}
                    </div>
                </div>`;
    });
}

// Render NGO Claims with Details
function renderNgoClaims(data) {
    const container = document.getElementById("claimsContainer");
    if (!container) return;
    container.innerHTML = "";

    if (data.length === 0) {
        container.innerHTML = "<p>You have no active claims. Browse available food to claim items!</p>";
        return;
    }

    data.sort((a, b) => b.claimedAt - a.claimedAt);

    data.forEach((item) => {
        let thumb = item.imageUrl || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100&h=100&fit=crop";
        let vegBadge = item.tags ? `<span class="status-tag">${item.tags[0]}</span>` : '';
        let phone = item.restaurantPhone || "N/A";

        // Determine buttons based on status
        let actionButtons = '';
        if (item.status === 'Claimed') {
            actionButtons = `
                    <button class="action-btn btn-complete" onclick="pickupFood('${item.id}')">Pick Up</button>
                    <button class="action-btn btn-cancel" onclick="deletePost('${item.id}')">Cancel</button>
                `;
        } else {
            actionButtons = `<span class="status-badge status-completed">Completed</span>`;
        }

        container.innerHTML += `
                <div class="listing-card">
                    <img src="${thumb}" class="list-thumb">
                    <div class="card-info">
                        <h3>${item.title} ${vegBadge}</h3>
                        
                        <div class="ngo-card-details">
                            <div class="ngo-detail-item"><i class="fa-solid fa-store"></i> ${item.restaurantName}</div>
                            <div class="ngo-detail-item"><i class="fa-solid fa-phone"></i> ${phone}</div>
                            <div class="ngo-detail-item"><i class="fa-solid fa-location-dot"></i> ${item.restaurantAddress}</div>
                            <div class="ngo-detail-item"><i class="fa-solid fa-bowl-food"></i> Qty: ${item.quantity}</div>
                        </div>
                    </div>
                    <div class="card-actions">
                         ${actionButtons}
                    </div>
                </div>`;
    });
}

// Added map icon to the restaurant name line
function renderBrowseCards(data) {
    const grid = document.getElementById("foodGrid");
    const countSpan = document.getElementById("count");
    if (!grid) return;

    if (countSpan) countSpan.innerText = data.length;
    grid.innerHTML = "";

    if (data.length === 0) {
        grid.innerHTML = `<div class="no-results">No listings match your search.</div>`;
        return;
    }

    data.forEach(item => {
        const displayImg = item.imageUrl || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500";
        let tagsHtml = (item.tags || []).map(tag => `<span class="tag">${tag}</span>`).join("");

        // Get the restaurant name and address for the map click handler
        const restName = item.restaurantName.replace(/'/g, "\\'"); // Escape single quotes
        const restAddress = item.restaurantAddress.replace(/'/g, "\\'"); // Escape single quotes

        grid.innerHTML += `
                <div class="food-card">
                    <div class="card-img-container">
                        <img src="${displayImg}" class="card-img"> 
                        <div class="card-tags">${tagsHtml}</div>
                    </div>
                    <div class="card-content">
                        <div class="restaurant-name">
                            <span>${item.restaurantName}</span>
                            <i class="fa-solid fa-map-pin restaurant-map-icon" 
                                onclick="showRestaurantMap('${restName}', '${restAddress}')"
                                title="View Map for ${restName}">
                            </i>
                        </div>
                        <h3 class="dish-title">${item.title}</h3>
                        <p class="dish-desc">${item.description || 'Freshly prepared surplus food.'}</p>
                        <div class="meta-row">
                            <div class="meta-item"><i class="fa-regular fa-user"></i> ${item.quantity}</div>
                            <div class="meta-item time">
                                <i class="fa-regular fa-clock"></i> 
                                ${item.pickupTime} 
                                (${item.uploadDate})
                            </div>
                        </div>
                        <button class="btn-claim" onclick="claimFood('${item.id}')">Claim This Food</button>
                    </div>
                </div>`;
    });
}

function updateDashboardStats(data) {
    const active = data.filter(i => i.status === "Active").length;
    const claimed = data.filter(i => i.status === "Claimed").length;
    const completed = data.filter(i => i.status === "Completed").length;
    const mealsCount = data.filter(i => i.status === "Completed")
        .reduce((acc, curr) => acc + (parseInt(curr.quantity) || 0), 0);

    const stats = document.querySelectorAll('#stats-restaurant .stat-number');
    if (stats.length >= 4) {
        stats[0].innerText = active;
        stats[1].innerText = claimed;
        stats[2].innerText = completed;
        stats[3].innerText = mealsCount;
    }
}

function updateNgoStats(data) {
    // Scheduled: Currently Active Claims
    const scheduled = data.filter(i => i.status === "Claimed").length;
    // Total Claimed: All items ever claimed (Claimed + Completed)
    const total = data.length;
    // Meals Distributed: Completed items
    const distributed = data.filter(i => i.status === "Completed")
        .reduce((acc, curr) => acc + (parseInt(curr.quantity) || 0), 0);
    // Partner Restaurants: Unique restaurant names
    const partners = new Set(data.map(i => i.restaurantName)).size;

    const stats = document.querySelectorAll('#stats-ngo .stat-number');
    if (stats.length >= 4) {
        stats[0].innerText = scheduled;
        stats[1].innerText = total;
        stats[2].innerText = distributed;
        stats[3].innerText = partners;
    }
}

// =========================================
// === 9. GLOBAL UTILITIES ===
// =========================================
window.deletePost = async function (docId) {
    // Try to find the item in either cache
    let itemToDelete = cachedMyData.find(i => i.id === docId) || cachedBrowseData.find(i => i.id === docId);

    if (!itemToDelete) return; // Should not happen if called from the UI

    // Determine confirmation message based on role/status
    let confirmationMessage = '';
    let isCancelClaim = false;

    if (userRole === 'NGO' && itemToDelete.status === 'Claimed') {
        confirmationMessage = "Cancel this claim? This will make the food available for other NGOs to claim.";
        isCancelClaim = true;
    } else if (userRole === 'Restaurant' && itemToDelete.status === 'Active') {
        confirmationMessage = "Delete this listing permanently?";
    } else if (userRole === 'Restaurant' && itemToDelete.status === 'Claimed') {
        confirmationMessage = "WARNING: Cancel this listing? This will void the claim made by an NGO and permanently delete the post.";
    } else if (userRole === 'Restaurant' && itemToDelete.status === 'Completed') {
        confirmationMessage = "Delete this completed record permanently?";
    } else {
        confirmationMessage = "Delete this item permanently?";
    }


    // --- EXECUTE DELETION/CANCELLATION ---
    if (await showCustomConfirm(confirmationMessage)) {
        try {
            const docRef = doc(db, "listings", docId);

            if (isCancelClaim) {
                // NGO cancelling a claim
                await updateDoc(docRef, {
                    status: "Active",
                    claimedBy: null, // Clear the claimedBy field
                    claimedAt: null  // Clear the claimedAt timestamp
                });
                showCustomAlert("Claim cancelled successfully!");
            } else {
                // Restaurant deleting/cancelling listing (Active, Claimed, or Completed)
                await deleteDoc(docRef);
                showCustomAlert("Listing deleted successfully.");
            }
        } catch (e) {
            console.error("Error deleting/cancelling item:", e);
            showCustomAlert("Error deleting/cancelling item.");
        }
    }
}

window.logout = function () {
    localStorage.clear();
    window.location.href = "login.html";
}

window.showView = function (viewId) {
    document.querySelectorAll('.view-home, #view-dashboard, #view-browse, #view-how').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    const targetView = document.getElementById('view-' + viewId);
    if (targetView) {
        targetView.classList.remove('hidden');
        const navItem = document.getElementById('nav-' + viewId);
        if (navItem) navItem.classList.add('active');
    }
}

// =========================================
// === 10. ROLE-BASED UI INITIALIZATION ===
// =========================================

// Set initial view and HOW IT WORKS section based on Role
if (userRole === 'NGO') {
    // UI for NGO
    document.getElementById("nav-browse").classList.remove('hidden');
    document.getElementById("dashboard-restaurant-content").classList.add("hidden");
    document.getElementById("dashboard-ngo-content").classList.remove("hidden");

    // Fix How It Works for NGO: Hide toggle, show only NGO steps
    document.getElementById("hiw-toggle-container").classList.add("hidden");
    document.getElementById("hiw-flow-restaurant").classList.add("hidden");
    document.getElementById("hiw-flow-ngo").classList.remove("hidden");

} else {
    // UI for Restaurant
    document.getElementById("nav-browse").classList.add('hidden');
    document.getElementById("dashboard-restaurant-content").classList.remove("hidden");
    document.getElementById("dashboard-ngo-content").classList.add("hidden");

    // Fix How It Works for Restaurant: Hide toggle, show only Restaurant steps
    document.getElementById("hiw-toggle-container").classList.add("hidden");
    document.getElementById("hiw-flow-restaurant").classList.remove("hidden");
    document.getElementById("hiw-flow-ngo").classList.add("hidden");
}

// Toggle FAQ
document.querySelectorAll('.faq-question').forEach(item => {
    item.addEventListener('click', () => {
        item.parentElement.classList.toggle('active');
    });
});

// =========================================
// === PROFILE MODAL FUNCTIONS ===
// =========================================

// Handler for profile photo upload
window.handleProfilePhotoUpload = async function (input) {
    if (input.files && input.files.length > 0) {
        const file = input.files[0];
        if (file.size > 500 * 1024) { // Limit to 500KB
            showCustomAlert("Image is too large! Max 500KB.");
            return;
        }

        try {
            const imageBase64 = await convertBase64(file);

            // Save to localStorage using the current user as the key
            localStorage.setItem(`profilePhoto_${currentUser}`, imageBase64);

            // Update UI immediately
            updateProfileAvatar(imageBase64);
            showCustomAlert("Profile photo uploaded successfully!");

        } catch (e) {
            console.error("Error uploading profile photo:", e);
            showCustomAlert("Error processing image.");
        }
    }
}

// Function to update the avatar display
function updateProfileAvatar(imageBase64) {
    const avatarIcon = document.querySelector('#profileAvatar i');
    const avatarImage = document.getElementById('profileImage');

    if (imageBase64) {
        avatarImage.src = imageBase64;
        avatarImage.classList.remove('hidden');
        if (avatarIcon) avatarIcon.classList.add('hidden');
    } else {
        avatarImage.classList.add('hidden');
        avatarImage.src = '';
        if (avatarIcon) avatarIcon.classList.remove('hidden');
    }
}

window.toggleProfileModal = function (event) {
    // Prevent the button click from triggering other events
    if (event) event.stopPropagation();

    const modalOverlay = document.getElementById('profileModal');
    const isHidden = modalOverlay.classList.contains('hidden');

    if (isHidden) {
        // Retrieve all necessary information
        const name = localStorage.getItem("loggedInUser") || 'N/A';
        const email = localStorage.getItem("loggedInEmail") || 'N/A';
        const role = localStorage.getItem("loggedInRole") || 'N/A';

        // Retrieve the photo for the current user
        const photoBase64 = localStorage.getItem(`profilePhoto_${currentUser}`);

        // Populate the modal
        document.getElementById('profileName').textContent = name;
        document.getElementById('profileEmail').textContent = email;
        document.getElementById('profileRole').textContent = role;

        // Update the avatar visual
        updateProfileAvatar(photoBase64);

        modalOverlay.classList.remove('hidden');
        // Close modal if user clicks outside of it
        document.addEventListener('click', closeProfileModalOutside);

    } else {
        modalOverlay.classList.add('hidden');
        document.removeEventListener('click', closeProfileModalOutside);
    }
}

// Toggle between View and Edit mode for the Name
window.toggleEditProfile = function(isEditing) {
    const displayArea = document.getElementById('profileDisplayArea');
    const editArea = document.getElementById('profileEditArea');
    
    if (isEditing) {
        displayArea.classList.add('hidden');
        editArea.classList.remove('hidden');
        document.getElementById('editProfileName').value = localStorage.getItem("loggedInUser");
    } else {
        displayArea.classList.remove('hidden');
        editArea.classList.add('hidden');
    }
}

// Save Name change to Firestore and LocalStorage
window.saveProfileName = async function() {
    const newName = document.getElementById('editProfileName').value.trim();
    const storedUid = localStorage.getItem("userUid"); 

    if (!newName) {
        showCustomAlert("Name cannot be empty.");
        return;
    }

    try {
        const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        const { getAuth, updateProfile } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js");
        
        const auth = getAuth();
        const userDocRef = doc(db, "users", storedUid); 
        
        // 1. Update Database
        await setDoc(userDocRef, { name: newName }, { merge: true });

        // 2. Update Auth Profile (Critical for re-login persistence)
        if (auth.currentUser) {
            await updateProfile(auth.currentUser, { displayName: newName });
        }

        // 3. Update Local session
        localStorage.setItem("loggedInUser", newName);
        currentUser = newName; // This updates the global variable in script.js
        
        document.getElementById('profileName').textContent = newName;
        showCustomAlert("Name updated successfully!");
        toggleEditProfile(false);
    } catch (error) {
        console.error("Error updating name:", error);
        showCustomAlert("Failed to update name.");
    }
}

// Helper function to close the modal when clicking outside
function closeProfileModalOutside(event) {
    const modal = document.querySelector('.profile-modal');
    const button = document.querySelector('.profile-btn');
    const fileInput = document.getElementById('profile-photo-upload');

    // Check if the click is on the file input or its label, so the file dialog works
    if (fileInput && (fileInput === event.target || fileInput.previousElementSibling === event.target)) {
        return;
    }

    // If the click is not inside the modal, and not on the profile button itself, close it.
    if (!modal.contains(event.target) && !button.contains(event.target)) {
        document.getElementById('profileModal').classList.add('hidden');
        document.removeEventListener('click', closeProfileModalOutside);
    }
}

// =========================================
// === LISTING MODAL FUNCTIONS ===
// =========================================
window.toggleCreateModal = function (show) {
    const modalOverlay = document.getElementById('listingModal');
    if (show) {
        // --- NEW: Automatically fill the restaurant name ---
        const nameInput = document.getElementById("restaurant-name");
        nameInput.value = currentUser || "Unknown Restaurant"; 
        
        modalOverlay.classList.remove('hidden');
    } else {
        modalOverlay.classList.add('hidden');
        if (isEditing) cancelEdit();
    }
}

window.openRatingModal = function (docId) {
    currentRatingDocId = docId;
    currentRating = 0;

    document.querySelectorAll("#starContainer i").forEach(star => {
        star.classList.remove("active");
    });

    document.getElementById("ratingModal").classList.remove("hidden");
};

window.closeRatingModal = function () {
    document.getElementById("ratingModal").classList.add("hidden");
};

document.addEventListener("click", function (e) {
    if (e.target.closest("#starContainer i")) {
        const value = Number(e.target.dataset.value);
        currentRating = value;

        document.querySelectorAll("#starContainer i").forEach(star => {
            star.classList.toggle("active", star.dataset.value <= value);
        });
    }
});

window.submitRating = async function () {
    if (currentRating === 0) {
        showCustomAlert("Please select stars first");
        return;
    }

    try {
        const docRef = doc(db, "listings", currentRatingDocId);
        await updateDoc(docRef, {
            rating: currentRating,
            ratedBy: currentUser,
            ratedAt: Date.now()
        });

        closeRatingModal();
        showCustomAlert("Thank you for rating the restaurant!");
    } catch (err) {
        console.error(err);
        showCustomAlert("Rating submission failed");
    }
};

// =========================================
// === THEME TOGGLE LOGIC ===
// =========================================
const themeBtn = document.getElementById('theme-toggle');
const body = document.body;
const icon = themeBtn.querySelector('i');

// Check for saved theme in localStorage
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark') {
    body.classList.add('dark-mode');
    icon.classList.replace('fa-moon', 'fa-sun');
}

themeBtn.addEventListener('click', () => {
    body.classList.toggle('dark-mode');
    
    if (body.classList.contains('dark-mode')) {
        icon.classList.replace('fa-moon', 'fa-sun');
        localStorage.setItem('theme', 'dark');
    } else {
        icon.classList.replace('fa-sun', 'fa-moon');
        localStorage.setItem('theme', 'light');
    }
});