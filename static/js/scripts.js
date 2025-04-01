// Initialize the map 
let map = L.map('map').setView([-9.19, -75.0152], 6);  // Centered on Peru
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

let subcatchmentsLayer; // Store geometry
let chart; // Store Chart.js instance

let selectedSubcatchment = null; // Store last clicked SC_ID

// Define URL for fetch commands
//const BASE_URL = "http://127.0.0.1:5000";
const BASE_URL = "https://vecc.onrender.com";

// Add map legend control
let legend = L.control({ position: "bottomright" });

// Update the legend content based on the selected variable
function updateLegend(variable){
    legend.onAdd = function (map) {
        let div = L.DomUtil.create("div", "legend");
        div.innerHTML = `<b>${variable.toUpperCase()} (mm)</b><br>`;

        //let grades = [800, 900, 1000, 1100, 1200];
        //let labels = ["< 800", "800 - 900", "900 - 1000", "1000 - 1100", "1100 - 1200", "> 1200"];
        let grades = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000];
        let labels = ["<100", "100-200","200-300", "300-400", "400-500", "500-600", "600-700","700-800", "800-900","900-1000", "1000-1100", "1100-1200", "1200-1300", "1300-1400", "1400-1500", "1500-1600", "1600-1700", "1700-1800", "1800-1900", "> 1900"];

        for (let i = 0; i < grades.length; i++) {
            div.innerHTML +=
                `<i style="background:${getColor(grades[i] + 1)}"></i> ${labels[i]}<br>`;
        }
        return div;
    };

    legend.addTo(map);  // Add the legend to the map after initialization
}

// Initialize the app (load geometry, years, scenarios, variables)
async function initializeApp() {
    await loadGeometry(); // Ensure geometry is fully loaded before proceeding
    await loadYears();    // Populate years in dropdown
    await loadScenarios(); // Populate scenarios in dropdown
    await loadVariables(); // Populate variables in dropdown

    // Define default values for dropdowns 
    document.getElementById("yearSelector").value = "2025";
    document.getElementById("scenarioSelector").value = "ssp585";
    document.getElementById("variableSelector").value = "pr";

    // Update the legend based on the initial selected variable
    updateLegend("pr");  // This updates the legend with the initial variable

    // Ensure the colors are updated for the first load
    await updateColors("2025");
}

// Call the initialization function after defining it
initializeApp();

// Event listeners for year, scenario and variable selection change (to update map and chart)
document.getElementById("yearSelector").addEventListener("change", (event) => {
    updateColors(event.target.value);
});
document.getElementById("scenarioSelector").addEventListener("change", () => {
    updateVisualization()
});
document.getElementById("variableSelector").addEventListener("change", (event) => {
    updateLegend(event.target.value); // Update legend when variable changes
    updateVisualization();
});

// Update the map colors based on selected year, scenario and variable
function updateVisualization(){
    const selectedYear = document.getElementById("yearSelector").value;
    updateColors(selectedYear);

    // Update the time series chart if a subcatchment is selected 
    const activePopup = document.querySelector(".leaflet-popup-content");
        if (selectedSubcatchment){
            loadTimeSeriesData(selectedSubcatchment); // Reload time series data
        }
}

// Function to load geometry (GeoJSON)
async function loadGeometry() {
    //const response = await fetch(`${BASE_URL}/subcatchments`);
    const response = await fetch(`/subcatchments`);
    const geojsonData = await response.json();

    return new Promise((resolve) => {
        subcatchmentsLayer = L.geoJSON(geojsonData, {
            style: { weight: 0.5, color: '#666', fillOpacity: 0.7 },
            onEachFeature: (feature, layer) => {
                layer.on('click', function () {
                    selectedSubcatchment = feature.properties.SC_ID; 
                    if (selectedSubcatchment) {
                        loadTimeSeriesData(selectedSubcatchment);
                        layer.bindPopup(`<div class="popup-content"><b>Subcuenca:</b> ${selectedSubcatchment} </div>`, { minWidth: 100, maxWidth: 200 }).openPopup(); 
                        showChart();
                    } else {
                        console.error("SC_ID not found for this subcatchment.");
                    }
                });
            }
        }).addTo(map);

        resolve();  // Resolve the promise when the layer is added
    });
}

// Function to update colors based on map data
async function updateColors(year) {
    const scenario = document.getElementById("scenarioSelector").value;  // Get selected scenario
    const variable = document.getElementById("variableSelector").value;  // Get selected variable

    try {
        //const response = await fetch(`${BASE_URL}/mapdata/${scenario}/${variable}/${year}`);
        const response = await fetch(`/mapdata/${scenario}/${variable}/${year}`);
        const mapData = await response.json();

        if (mapData.error) {
            console.error("Error loading variable data:", mapData.error);
            return;
        }

        subcatchmentsLayer.eachLayer(layer => {
            const id = layer.feature.properties.SC_ID;
            const value = mapData[id] || 0; // Default to 0 if missing
            layer.setStyle({
                fillColor: getColor(value)
            });
        });
    } catch (error) {
        console.error("Error updating colors:", error);
    }
}

// Function to get colors based on values
function getColor(value) {
    return value > 1900 ? '#3B0066' :  // Dark purple
           value > 1800 ? '#4A008A' :
           value > 1700 ? '#5A1DD8' :
           value > 1600 ? '#6333F7' :
           value > 1500 ? '#3E5CFA' :
           value > 1400 ? '#3580F7' :
           value > 1300 ? '#2FA4F4' :
           value > 1200 ? '#2AC6E7' :
           value > 1100 ? '#36D3D0' :
           value > 1000 ? '#42E0B5' :
           value > 900  ? '#5FEB9C' :
           value > 800  ? '#7AF085' :
           value > 700  ? '#96E86E' :  // First blue-greenish tones
           value > 600  ? '#B2DC58' :
           value > 500  ? '#E0BE3C' :
           value > 400  ? '#E89730' :
           value > 300  ? '#E06928' :
           value > 200  ? '#D53C20' :
           value > 100  ? '#BB1818' :
                          '#990808';  // Deep red
}

// Function to update tome series chart
function updateTimeSeries() {
    const scenario = document.getElementById("scenarioSelector").value;
    const variable = document.getElementById("variableSelector").value;
    
    if (!selectedSubcatchment) {
        console.log("No subcatchment selected.");
        return;
    }

    fetch(`/timeseries/${scenario}/${variable}/${selectedSubcatchment}`)
        .then(response => {
            if (!response.ok) {
                throw new Error("Time series data not found");
            }
            return response.text();
        })
        .then(csvData => {
            const parsedData = parseCSVData(csvData);
            updateChart(parsedData);
        })
        .catch(error => console.error("Error fetching time series data:", error));
}

// Function to load available years into dropdown
async function loadYears() {
    try {
        //const response = await fetch('${BASE_URL}/years');
        const response = await fetch('/years');
        if (!response.ok) {
            throw new Error("Failed to fetch years.");
        }

        const years = await response.json();
        console.log("Years:", years);  // Debugging Log

        const selector = document.getElementById("yearSelector");
        selector.innerHTML = "";  // Clear previous options

        if (years.length === 0) {
            console.warn("No years found!");
            return;
        }

        years.forEach(year => {
            const option = document.createElement("option");
            option.value = year;
            option.textContent = year;
            selector.appendChild(option);
        });

        // Set default year to 2025 if available, otherwise use the first available year
        const defaultYear = years.includes(2025) ? 2025 : years[0];
        selector.value = defaultYear;

        console.log(`Loading initial variable data for year: ${defaultYear}`);

        await updateColors(defaultYear);  // Ensure colors load only after years are set

    } catch (error) {
        console.error("Error loading years:", error);
    }
}

// Function to load available scenarios into dropdown
async function loadScenarios() {
    try {
        //const response = await fetch('${BASE_URL}/scenarios');
        const response = await fetch('/scenarios');
        if (!response.ok) {
            throw new Error("Failed to fetch scenarios.");
        }

        const scenarios = await response.json();
        console.log("Scenarios:", scenarios);  // Debugging Log

        const selector = document.getElementById("scenarioSelector");
        selector.innerHTML = "";  // Clear previous options

        if (scenarios.length === 0) {
            console.warn("No scenarios found!");
            return;
        }

        scenarios.forEach(scenario => {
            const option = document.createElement("option");
            option.value = scenario;
            option.textContent = scenario;
            selector.appendChild(option);
        });

        // Set default scenario to ssp585 if available, otherwise use the first available scenario
        const defaultScenario = scenarios.includes("ssp585") ? "ssp585" : scenarios[0];
        selector.value = defaultScenario;

        console.log(`Loading initial variable data for scenario: ${defaultScenario}`);

        await updateColors(defaultScenario);  // Ensure colors load only after scenarios are set

    } catch (error) {
        console.error("Error loading scenarios:", error);
    }
}

// Function to load available variables into dropdown
async function loadVariables() {
    try {
        //const response = await fetch('${BASE_URL}/variables');
        const response = await fetch('/variables');
        if (!response.ok) {
            throw new Error("Failed to fetch variables.");
        }

        const variables = await response.json();
        console.log("Variables:", loadVariables);  // Debugging Log

        const selector = document.getElementById("variableSelector");
        selector.innerHTML = "";  // Clear previous options

        if (variables.length === 0) {
            console.warn("No variables found!");
            return;
        }

        variables.forEach(variable => {
            const option = document.createElement("option");
            option.value = variable;
            option.textContent = variable;
            selector.appendChild(option);
        });

        // Set default variable to pr if available, otherwise use the first available variable
        const defaultVariable = variables.includes("pr") ? "pr" : variables[0];
        selector.value = defaultVariable;

        console.log(`Loading initial data for variable: ${defaultVariable}`);

        await updateColors(defaultVariable);  // Ensure colors load only after variable is set

    } catch (error) {
        console.error("Error loading variables:", error);
    }
}

// Function to load time series chart for a subcatchment
async function loadTimeSeriesData(sc_id) {
    const scenario = document.getElementById("scenarioSelector").value;  // Get selected scenario
    const variable = document.getElementById("variableSelector").value;  // Get selected variable
    try {
        //const response = await fetch(`${BASE_URL}/timeseries/${scenario}/${variable}/${sc_id}`);
        const response = await fetch(`/timeseries/${scenario}/${variable}/${sc_id}`);
        if (!response.ok){
            throw new Error("Time series data not found");
        }

        const csvData = await response.text();
        const parsedData = parseCSV(csvData);

        if (parsedData.dates.length === 0) {
            console.warn("No data found for SC_ID:", sc_id);
            return;
        }

        renderChart(parsedData, sc_id);   // Pass sc_id to renderChart
    } catch (error) {
        console.error("Error loading time series data:", error);
    }
}

// Function to show time series chart
function showChart() {
    const chartContainer = document.getElementById("chart-container");
    if (chartContainer) {
        chartContainer.style.display = "block";
        console.log("Chart container shown:", chartContainer.style.display);

        // Make sure the "x" button is visible
        const closeButton = document.getElementById("closeChartButton");
        if (closeButton) {
            closeButton.style.display = "block";  // Ensure the button is visible
        } else {
            console.error('Close button not found!');
        }
    } else {
        console.error('Chart container not found!');
    }

    document.getElementById("chart-container").style.display = "block";
    console.log("Chart container shown:", document.getElementById("chart-container").style.display); // Debugging log

    // Make sure the "x" button is visible 
    const closeButton = document.getElementById("closeChartButton");
    closeButton.style.display = "block";  // Ensure the button is visible
}

// Function to hide the chart
function closeChart() {
    const chartContainer = document.getElementById("chart-container");
    chartContainer.style.display = "none";

    // Optionally destroy the chart to free resources
    if (chart) {
        chart.destroy();
    }
}

// Event listener for the close button
document.getElementById("closeChartButton").addEventListener("click", function() {
    console.log("Close button clicked");
    closeChart();
});

// Function to parse time series CSV data into usable arrays
function parseCSV(csvData) {
    const rows = csvData.split("\n").slice(1); // Split by lines and remove header row
    const dates = [];
    const medians = [];
    const lowerCIs = [];
    const upperCIs = [];

    rows.forEach(row => {
        const columns = row.split(",");
        if (columns.length === 4) {
            dates.push(columns[0]);
            medians.push(parseFloat(columns[1]));
            lowerCIs.push(parseFloat(columns[2]));
            upperCIs.push(parseFloat(columns[3]));
        }
    });

    return { dates, medians, lowerCIs, upperCIs };
}

// Function to render the time series chart using Chart.js
function renderChart(data, sc_id) {
    const canvasContainer = document.getElementById('chart-container');

    // Clear only the canvas, preserving the close button
    const oldCanvas = document.getElementById('timeSeriesChart');
    if (oldCanvas) {
        oldCanvas.remove(); // Remove old canvas
    }

    // Create a new canvas element
    const newCanvas = document.createElement('canvas');
    newCanvas.id = 'timeSeriesChart';
    canvasContainer.appendChild(newCanvas);

    const ctx = newCanvas.getContext('2d');

    // Destroy the existing chart (if any)
    if (chart) {
        chart.destroy();
    }

    // Get the selected variable and scenario
    const variable = document.getElementById("variableSelector").value;  
    const scenario = document.getElementById("scenarioSelector").value;  

    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.dates,
            datasets: [
                {
                    label: 'Mediano',
                    data: data.medians,
                    borderColor: 'blue',
                    borderWidth: 1,
                    fill: false,
                    pointRadius: 0,
                    pointStyle: 'line'
                },
                {
                    label: 'IC 90% Superior',
                    data: data.upperCIs,
                    borderColor: 'green',
                    borderWidth: 1,
                    fill: false,
                    pointRadius: 0,
                    pointStyle: 'line'
                },
                {
                    label: 'IC 90% Inferior',
                    data: data.lowerCIs,
                    borderColor: 'red',
                    borderWidth: 1,
                    fill: false,
                    pointRadius: 0,
                    pointStyle: 'line'
                }
            ]
        },
        options: {
            responsive: true,   
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `Escenario: ${scenario.toUpperCase()}  -  Subcuenca: ${sc_id ? sc_id : 'Unknown'}`, // Fallback if sc_id is undefined
                    font: {
                        size: 12,
                        weight: 'normal'
                    },
                    padding: {
                        bottom: 10
                    }
                },
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true, // Use line style in legend instead of boxes
                        boxWidth: 40,  // Adjust line length in legend
                        font: {
                            size: 11
                        }
                    }
                }
            },  
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'year',
                        tooltipFormat: 'YYYY'
                    },
                    title: {
                        display: false  // Remove axis title "Date"
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: `${variable.toUpperCase()} (mm)`,                        
                    }
                }
            }
        }
    });
}

// Update the legend when the variable selector changes
document.getElementById("variableSelector").addEventListener("change", function() {
    //legend.remove();  // Remove the old legend
    legend.addTo(map);
});

// Ensure the map loads with colors
document.addEventListener("DOMContentLoaded", () => {
    const selectedYear = document.getElementById("yearSelector").value;
    updateColors(selectedYear);
});

loadGeometry();  // Load geometry (subcatchments) initially
loadYears();  // Populate the dropdown with years

