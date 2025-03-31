let map = L.map('map').setView([-9.19, -75.0152], 6);  // Centered on Peru
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

let subcatchmentsLayer; // Store geometry
let chart; // Store Chart.js instance

// Add map legend control
let legend = L.control({ position: "bottomright" });

// Define map legend content
legend.onAdd = function (map) {
    let div = L.DomUtil.create("div", "legend");
    div.innerHTML = `<b>${document.getElementById("variableSelector").value.toUpperCase()} (mm)</b><br>`;

    let grades = [800, 900, 1000, 1100, 1200];
    let labels = ["< 800", "800 - 900", "900 - 1000", "1000 - 1100", "1100 - 1200", "> 1200"];

    for (let i = 0; i < grades.length; i++) {
        div.innerHTML +=
            `<i style="background:${getColor(grades[i] + 1)}"></i> ${labels[i]}<br>`;
    }

    return div;
};

// Add the legend to the map
legend.addTo(map);

// Funtion to show time series chart
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

// Function to load geometry (GeoJSON)
async function loadGeometry() {
    const response = await fetch("http://127.0.0.1:5000/subcatchments");
    const geojsonData = await response.json();

    return new Promise((resolve) => {
        subcatchmentsLayer = L.geoJSON(geojsonData, {
            style: { weight: 0.5, color: '#666', fillOpacity: 0.7 },
            onEachFeature: (feature, layer) => {
                layer.on('click', function () {
                    const sc_id = feature.properties.SC_ID; 
                    if (sc_id) {
                        loadTimeSeriesData(sc_id);
                        layer.bindPopup(`<div class="popup-content"><b>Subcatchment ID:</b> ${sc_id} </div>`, { minWidth: 100, maxWidth: 200 }).openPopup(); 
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

// Function to fetch and display the time series chart for the selected subcatchment
async function loadTimeSeriesData(sc_id) {
    const scenario = document.getElementById("scenarioSelector").value;  // Get selected scenario
    const variable = document.getElementById("variableSelector").value;  // Get selected variable
    try {
        const response = await fetch(`http://127.0.0.1:5000/timeseries/${scenario}/${variable}/${sc_id}`);
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

    // Get the selected variable
    const variable = document.getElementById("variableSelector").value;  // Get selected variable

    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.dates,
            datasets: [
                {
                    label: 'Median',
                    data: data.medians,
                    borderColor: 'blue',
                    borderWidth: 1,
                    fill: false,
                    pointRadius: 0,
                    pointStyle: 'line'
                },
                {
                    label: 'Lower 90% CI',
                    data: data.lowerCIs,
                    borderColor: 'red',
                    borderWidth: 1,
                    fill: false,
                    pointRadius: 0,
                    pointStyle: 'line'
                },
                {
                    label: 'Upper 90% CI',
                    data: data.upperCIs,
                    borderColor: 'green',
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
                    text: `Subcatchment: ${sc_id ? sc_id : 'Unknown'}`, // Fallback if sc_id is undefined
                    font: {
                        size: 14,
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
                        boxWidth: 40  // Adjust line length in legend
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

// Function to update colors based on map data
async function updateColors(year) {
    const scenario = document.getElementById("scenarioSelector").value;  // Get selected scenario
    const variable = document.getElementById("variableSelector").value;  // Get selected variable

    try {
        const response = await fetch(`http://127.0.0.1:5000/mapdata/${scenario}/${variable}/${year}`);
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
    return value > 1200 ? '#08306b' :
           value > 1100 ? '#2879b9' :
           value > 1000 ? '#67a9cf' :
           value > 900  ? '#a6d6eb' :
           value > 800  ? '#ffffb2' :
                          '#fed976';
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

// Event listener for year selection change
document.getElementById("yearSelector").addEventListener("change", (event) => {
    updateColors(event.target.value);
});

// Event listeners for scenario and variable selection changes
document.getElementById("scenarioSelector").addEventListener("change", updateVisualization);
document.getElementById("variableSelector").addEventListener("change",updateVisualization);

function updateVisualization(){
    // Update the map colors based on the selected year
    const selectedYear = document.getElementById("yearSelector").value;
    updateColors(selectedYear);

    // Update the time series chart if a subcatchment is selected 
    const activePopup = document.querySelector(".leaflet-popup-content");
    if(activePopup) {
        const sc_id = activePopup.textContent.match(/\d+/)[0]; // Extract SC_ID from the popup
        if (sc_id){
            loadTimeSeriesData(sc_id); // Reload time series data
        }
    }

    // Update the legend with the selected variable
    legend.remove();  // Remove old legend
    legend.addTo(map); // Add updated legend with new variable
}

// Function to load available years into dropdown
async function loadYears() {
    try {
        const response = await fetch('http://127.0.0.1:5000/years');
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
        const response = await fetch('http://127.0.0.1:5000/scenarios');
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
        const response = await fetch('http://127.0.0.1:5000/variables');
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

loadGeometry();  // Load geometry (subcatchments) initially
loadYears();  // Populate the dropdown with years

// Initialize the app in the correct order
async function initializeApp() {
    await loadGeometry(); // Ensure geometry is fully loaded before proceeding
    await loadYears();    // Populate years in dropdown
    await loadScenarios(); // Populate scenarios in dropdown
    await loadVariables(); // Populate variables in dropdown

    // Define default values for dropdowns 
    document.getElementById("yearSelector").value = "2025";
    document.getElementById("scenarioSelector").value = "ssp585";
    document.getElementById("variableSelector").value = "pr";

    // Ensure the colors are updated for the first load
    await updateColors("2025");
}

// Call the initialization function after defining it
initializeApp();