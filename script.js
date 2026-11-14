// Fuel & vehicle page.
// Vehicle data comes from mauritius_cars_fuel.json (same folder). The JSON
// stores consumption in L/100 km, so no MPG conversion is needed.
//
// Note: browsers block fetch() for pages opened straight from disk (file://).
// Open the app through a local server, e.g. VS Code's "Live Server" extension.
const DATA_URL = "mauritius_cars_fuel.json";

// Saved car, home/work places and calibrations live in this browser's storage.
const PRESET_KEY = "fuel.presets.v1";

const fuelConsumptionInput = document.getElementById("fuelConsumption");
const fuelPriceInput = document.getElementById("fuelPrice");
const originInput = document.getElementById("origin");
const destinationInput = document.getElementById("destination");
const calculateButton = document.getElementById("calculate");
const result = document.getElementById("result");
const vehicleInfo = document.getElementById("vehicleInfo");
const disclaimer = document.getElementById("disclaimer");

const yearSelect = document.getElementById("year");
const makeSelect = document.getElementById("make");
const modelSelect = document.getElementById("model");
const vehicleSelect = document.getElementById("vehicle");

const carStatus = document.getElementById("carStatus");
const calLitres = document.getElementById("calLitres");
const calKm = document.getElementById("calKm");
const calStatus = document.getElementById("calStatus");
const resetCalButton = document.getElementById("resetCal");
const homeAddress = document.getElementById("homeAddress");
const workAddress = document.getElementById("workAddress");
const placesStatus = document.getElementById("placesStatus");
const routeChips = document.getElementById("routeChips");

let vehicles = []; // filled from the JSON, each with numeric `from` / `to` years

// ---------- presets (saved in the browser) ----------
function loadPresets() {
    try {
        return JSON.parse(AppStorage.getItem(PRESET_KEY)) || {};
    } catch (e) {
        return {};
    }
}
function savePresets() {
    try {
        AppStorage.setItem(PRESET_KEY, JSON.stringify(presets));
        return true;
    } catch (e) {
        return false;
    }
}
const presets = loadPresets();
presets.calibrations = presets.calibrations || {}; // { vehicleId | "custom": L/100 km }

// Calibration is stored per vehicle; without a vehicle picked it's "custom".
const calibrationKey = () => vehicleSelect.value || "custom";

// ---------- startup ----------
homeAddress.value = presets.home || "";
workAddress.value = presets.work || "";
renderRouteChips();
if (presets.calibrations.custom) {
    fuelConsumptionInput.value = presets.calibrations.custom.toFixed(1);
}
renderCalibration();
loadVehicles();

// ---------- vehicle dropdowns ----------
yearSelect.addEventListener("change", () => {
    const year = Number(yearSelect.value);
    resetSelect(makeSelect, "Select make");
    resetSelect(modelSelect, "Select model");
    resetSelect(vehicleSelect, "Select vehicle");
    applyVehicle();
    if (year) getMakes(year);
});
makeSelect.addEventListener("change", () => {
    const year = Number(yearSelect.value);
    const make = makeSelect.value;
    resetSelect(modelSelect, "Select model");
    resetSelect(vehicleSelect, "Select vehicle");
    applyVehicle();
    if (make) getModels(year, make);
});
modelSelect.addEventListener("change", () => {
    const year = Number(yearSelect.value);
    const make = makeSelect.value;
    const model = modelSelect.value;
    resetSelect(vehicleSelect, "Select vehicle");
    applyVehicle();
    if (model) getVehicles(year, make, model);
});
vehicleSelect.addEventListener("change", applyVehicle);

// Fill in consumption for the chosen vehicle: your calibrated figure if you
// have one, otherwise the catalogue value.
function applyVehicle() {
    carStatus.textContent = "";
    const vehicle = getFuelConsumption(vehicleSelect.value);
    if (!vehicle) {
        vehicleInfo.textContent = "";
        renderCalibration();
        return;
    }
    const rated = vehicle.consumption_l_per_100km;
    const calibrated = presets.calibrations[vehicle.id];
    fuelConsumptionInput.value = (calibrated || rated).toFixed(1);

    const basis = vehicle.consumption_basis === "manufacturer_combined"
        ? "manufacturer combined rating"
        : "indicative estimate";
    vehicleInfo.textContent =
        `${vehicle.make} ${vehicle.model}: ${rated} L/100 km ` +
        `(${(100 / rated).toFixed(1)} km/L), ${basis}.` +
        (calibrated ? ` Using your calibrated ${calibrated.toFixed(1)} L/100 km instead.` : "");
    renderCalibration();
}

async function loadVehicles() {
    try {
        const response = await fetch(DATA_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        vehicles = data.vehicles.map((v) => {
            const [from, to] = v.year_range.split("-").map(Number);
            return { ...v, from, to };
        });
        disclaimer.textContent = data.disclaimer;
        getYears();
        restoreCar();
    } catch (err) {
        console.error(err);
        showError(
            `Couldn't load ${DATA_URL}. Open the app through a local server ` +
            `(e.g. VS Code Live Server) instead of double-clicking the HTML file.`
        );
    }
}

function resetSelect(select, label) {
    select.innerHTML = "";
    addOption(select, "", label);
}

function addOption(select, value, text = value) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    select.appendChild(option);
}

// Vehicles whose year range includes the chosen year
const vehiclesForYear = (year) => vehicles.filter((v) => year >= v.from && year <= v.to);

function getYears() {
    const newest = Math.max(...vehicles.map((v) => v.to));
    const oldest = Math.min(...vehicles.map((v) => v.from));
    for (let year = newest; year >= oldest; year--) addOption(yearSelect, year);
}

function getMakes(year) {
    const makes = [...new Set(vehiclesForYear(year).map((v) => v.make))].sort();
    makes.forEach((make) => addOption(makeSelect, make));
}

function getModels(year, make) {
    const models = [...new Set(
        vehiclesForYear(year).filter((v) => v.make === make).map((v) => v.model)
    )].sort();
    models.forEach((model) => addOption(modelSelect, model));
}

function getVehicles(year, make, model) {
    vehiclesForYear(year)
        .filter((v) => v.make === make && v.model === model)
        .forEach((v) => {
            const label = `${v.engine_l.toFixed(1)} L ${v.fuel_type}, ${v.transmission} (${v.year_range})`;
            addOption(vehicleSelect, v.id, label);
        });
    // Only one engine option? Select it straight away.
    if (vehicleSelect.options.length === 2) {
        vehicleSelect.selectedIndex = 1;
        applyVehicle();
    }
}

function getFuelConsumption(vehicleID) {
    return vehicles.find((v) => v.id === vehicleID);
}

// ---------- saved car ----------
document.getElementById("saveCar").addEventListener("click", () => {
    if (!vehicleSelect.value) {
        carStatus.textContent = "Pick a year, make, model and engine first.";
        return;
    }
    presets.car = {
        year: yearSelect.value,
        make: makeSelect.value,
        model: modelSelect.value,
        vehicleId: vehicleSelect.value,
    };
    carStatus.textContent = savePresets()
        ? "Saved. Your car will load automatically next time."
        : "Couldn't save: browser storage is blocked.";
});

function restoreCar() {
    const car = presets.car;
    if (!car || !getFuelConsumption(car.vehicleId)) return;
    yearSelect.value = car.year;
    getMakes(Number(car.year));
    makeSelect.value = car.make;
    getModels(Number(car.year), car.make);
    modelSelect.value = car.model;
    getVehicles(Number(car.year), car.make, car.model);
    vehicleSelect.value = car.vehicleId;
    applyVehicle();
    carStatus.textContent = "Loaded your saved car.";
}

// ---------- calibration ----------
document.getElementById("calibrate").addEventListener("click", () => {
    const litres = Number(calLitres.value);
    const km = Number(calKm.value);
    if (!(litres > 0) || !(km > 0)) {
        calStatus.textContent = "Enter both the litres filled and the km driven.";
        return;
    }
    const lPer100 = (litres / km) * 100;
    if (lPer100 < 1 || lPer100 > 30) {
        calStatus.textContent =
            `That works out to ${lPer100.toFixed(1)} L/100 km, which looks wrong. Check the numbers.`;
        return;
    }
    presets.calibrations[calibrationKey()] = Math.round(lPer100 * 10) / 10;
    const saved = savePresets();
    calLitres.value = "";
    calKm.value = "";
    fuelConsumptionInput.value = presets.calibrations[calibrationKey()].toFixed(1);
    if (vehicleSelect.value) applyVehicle(); else renderCalibration();
    if (!saved) calStatus.textContent += " (Not saved: browser storage is blocked.)";
});

resetCalButton.addEventListener("click", () => {
    delete presets.calibrations[calibrationKey()];
    savePresets();
    if (vehicleSelect.value) applyVehicle();
    else renderCalibration();
});

// Show the calibrated figure for the current car and how it compares to the rating
function renderCalibration() {
    const calibrated = presets.calibrations[calibrationKey()];
    const vehicle = getFuelConsumption(vehicleSelect.value);
    resetCalButton.classList.toggle("hidden", !calibrated || !vehicle);
    if (!calibrated) {
        calStatus.textContent = "";
        return;
    }
    let text = `Your real consumption: ${calibrated.toFixed(1)} L/100 km (${(100 / calibrated).toFixed(1)} km/L)`;
    if (vehicle) {
        const rated = vehicle.consumption_l_per_100km;
        const diff = Math.round(((calibrated - rated) / rated) * 100);
        text += diff === 0
            ? `, the same as the ${rated} L/100 km rating.`
            : `, ${Math.abs(diff)}% ${diff > 0 ? "more" : "less"} than the ${rated} L/100 km rating.`;
    } else {
        text += ".";
    }
    calStatus.textContent = text;
}

// ---------- saved places ----------
document.getElementById("savePlaces").addEventListener("click", () => {
    presets.home = homeAddress.value.trim();
    presets.work = workAddress.value.trim();
    placesStatus.textContent = savePresets() ? "Saved." : "Couldn't save: browser storage is blocked.";
    renderRouteChips();
});

function renderRouteChips() {
    const ready = Boolean(presets.home && presets.work);
    routeChips.classList.toggle("hidden", !ready);
    routeChips.classList.toggle("flex", ready);
}

document.getElementById("homeToWork").addEventListener("click", () => {
    originInput.value = presets.home;
    destinationInput.value = presets.work;
});
document.getElementById("workToHome").addEventListener("click", () => {
    originInput.value = presets.work;
    destinationInput.value = presets.home;
});

// ---------- journey cost ----------
function showError(message) {
    result.className = "mt-4 text-sm text-red-500";
    result.textContent = message;
}

calculateButton.addEventListener("click", async () => {
    const fuelConsumption = Number(fuelConsumptionInput.value);
    const fuelPrice = Number(fuelPriceInput.value);
    const origin = originInput.value.trim();
    const destination = destinationInput.value.trim();
    if (!origin || !destination) return showError("Enter an origin and a destination.");
    if (!(fuelConsumption > 0)) return showError("Pick a vehicle or type its fuel consumption (L/100 km).");
    if (!(fuelPrice > 0)) return showError("Enter the fuel price per litre.");

    result.className = "mt-4 text-sm text-slate-500 dark:text-neutral-400";
    result.textContent = "Getting route distance…";
    let distance;
    try {
        distance = await getDistance(origin, destination);
    } catch (err) {
        console.error(err);
        return showError("Couldn't get a route from Google Maps. Check the addresses and the API key.");
    }

    const fuelUsed = (distance * fuelConsumption) / 100;
    const cost = fuelUsed * fuelPrice;

    result.className = "mt-4 rounded-2xl border border-slate-200 p-4 dark:border-neutral-800";
    result.innerHTML = `
        <p class="text-sm text-slate-600 dark:text-neutral-300">Journey cost</p>
        <p class="mt-1 text-3xl font-bold">Rs ${cost.toFixed(2)}</p>
        <p class="mt-2 text-sm text-slate-500 dark:text-neutral-400">
            ${distance.toFixed(2)} km · ${fuelUsed.toFixed(2)} L of fuel
        </p>`;
});

async function getDistance(origin, destination) {
    if (typeof google === "undefined" || !google.maps) throw new Error("Google Maps not loaded");
    const { Route } = await google.maps.importLibrary("routes");
    const request = {
        origin: origin,
        destination: destination,
        travelMode: "DRIVING",
        fields: ["distanceMeters"],
    };

    const response = await Route.computeRoutes(request);

    if (!response.routes || response.routes.length === 0) {
        throw new Error("No route found");
    }

    return response.routes[0].distanceMeters / 1000;
}
