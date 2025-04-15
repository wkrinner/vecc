// Initialize the map 
let map = L.map('map').setView([-9.19, -75.0152], 6);  // Centered on Peru
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

let subcatchmentsLayer; // Store geometry
let chart; // Store Chart.js instance

let selectedSubcatchment = null; // Store last clicked SC_ID
//let currentType = "abs"; // default data type

// Add map legend control
let legend = L.control({ position: "bottomright" });
let additionalLayer_rios;

// Function for conversion to title case
function toTitleCase(str) {
    if (!str) return "";
    return str
      .toLowerCase()
      .split(" ")
      .map(word =>
        word
          .split("-")
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join("-")
      )
      .join(" ");
  }

// Update the legend content based on the selected variable and type
function updateLegend(variable, type = "abs"){
    legend.onAdd = function (map) {
        let div = L.DomUtil.create("div", "legend");

        if (type === "dif") {
            div.innerHTML = `<b>Δ ${variable.toUpperCase()} (mm)</b><br>`;
            const difGrades = [-400, -300, -200, -100, 0, 100, 200, 300, 400];
            const difLabels = ["< -300", "-300 to -200", "-200 to -100", "-100 to 0", "0", 
                            "0 to 100", "100 to 200", "200 to 300", ">300"];
            for (let i = 0; i < difGrades.length; i++) {
                div.innerHTML += `<i style="background:${getColor(difGrades[i], "dif")}"></i> ${difLabels[i]}<br>`;
            }
        } else if (type === "pct") {
            div.innerHTML = `<b>Δ ${variable.toUpperCase()} (%)</b><br>`;
            const pctGrades = [-.4, -.3, -.2, -.1, 0, .1, .2, .3, .4];
            const pctLabels = ["< -30%", "-30% to -20%", "-20% to -10%", "-10% to 0%", "0%", 
                            "0% to 10%", "10% to 20%", "20% to 30%", "> 30%"];
            for (let i = 0; i < pctGrades.length; i++) {
                div.innerHTML += `<i style="background:${getColor(pctGrades[i], "pct")}"></i> ${pctLabels[i]}<br>`;
            }
        } else {
            div.innerHTML = `<b>${variable.toUpperCase()} (mm)</b><br>`;
            const grades = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000];
            const labels = ["<100", "100-200","200-300", "300-400", "400-500", "500-600", "600-700","700-800", "800-900","900-1000", "1000-1100", "1100-1200", "1200-1300", "1300-1400", "1400-1500", "1500-1600", "1600-1700", "1700-1800", "1800-1900", "> 1900"];
            for (let i = 0; i < grades.length; i++) {
                div.innerHTML += `<i style="background:${getColor(grades[i] + 1)}"></i> ${labels[i]}<br>`;
            }
        }
        return div;
    };

    legend.addTo(map);  // Add the legend to the map 
}

async function initializeApp() {
    await loadGeometry(); // Load map features first

    // Load dropdown options and get default selections
    const defaultYear = await loadYears();
    const defaultScenario = await loadScenarios();
    const defaultVariable = await loadVariables();
    const defaultSeason = await loadSeasons();
    await loadTypes(); // You could also return a defaultType here if needed

    // Set dropdown values to defaults
    document.getElementById("yearSelector").value = defaultYear;
    document.getElementById("scenarioSelector").value = defaultScenario;
    document.getElementById("variableSelector").value = defaultVariable;
    document.getElementById("seasonSelector").value = defaultSeason;

    const typeButton = document.querySelector(`.type-button[data-value="abs"]`);
    if (typeButton) {
        typeButton.classList.add("active");
    }

    // Update the legend and color the map
    updateLegend(defaultVariable, "abs");

    if (defaultYear && defaultScenario && defaultVariable && defaultSeason) {
        console.log(`Loading initial data for year: ${defaultYear}`);
        await updateColors(defaultYear);
    }
}

// Call the initialization function after defining it
initializeApp();

// Event listeners for year, scenario, variable and data type selection change (to update map, chart and legend)
document.getElementById("yearSelector").addEventListener("change", (event) => {
    updateColors(event.target.value);
});
document.getElementById("scenarioSelector").addEventListener("change", () => {
    updateVisualization()
});
document.getElementById("variableSelector").addEventListener("change", (event) => {
    //updateLegend(event.target.value, type); // Update legend when variable changes
    updateVisualization();
});
document.getElementById("seasonSelector").addEventListener("change", (event) => {
    updateVisualization();
});
document.getElementById("typeSelector").addEventListener("change", (event) => {
    //updateLegend(variable, type); // Update legend when variable changes
    updateVisualization();
});

// Update the map colors based on selected year, scenario, season and variable
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
    const response = await fetch('/subcatchments');
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
    const season = document.getElementById("seasonSelector").value;  // Get selected season
    const activeTypeButton = document.querySelector(".type-button.active");  // Get selected data type
    const type = activeTypeButton ? activeTypeButton.dataset.value : "abs";

    console.log("scenario:", scenario);  // Debugging
    console.log("variable:", variable);
    console.log("year:", year);
    console.log("season:", season);
    console.log("type:", type);

    try {
        const response = await fetch(`/mapdata/${scenario}/${variable}/${year}/${season}/${type}`);
        console.log("Fetching:", response.url);
        const mapData = await response.json();
        
        if (mapData.error) {
            console.error("Error loading variable data:", mapData.error);
            return;
        }

        subcatchmentsLayer.eachLayer(layer => {
            const id = layer.feature.properties.SC_ID;
            const value = mapData[id] || 0; // Default to 0 if missing
            layer.setStyle({
                fillColor: getColor(value, type)
            });
        });
        updateLegend(variable, type)  
    } catch (error) {
        console.error("Error updating colors:", error);
    }
}

// Function to get colors based on values
function getColor(value, type) {
    if (type == "dif"){
        const scale = chroma.scale(['brown', 'yellow', 'white', 'lightgreen', 'darkgreen'])
                            .domain([-400, -300, -200, -100, 0, 100, 200, 300, 400]);
            return scale(value).hex();
    } else if (type == "pct"){
        const scale = chroma.scale(['brown', 'yellow', 'white', 'lightgreen', 'darkgreen'])
                            .domain([-.4, -.3, -.2, -.1, 0, .1, .2, .3, .4]);
            return scale(value).hex();
    } else {
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
}

// Function to load available years into dropdown
async function loadYears() {
    try {
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
        const defaultYear = years.includes("2025") ? 2025 : years[0];
        selector.value = defaultYear;

        console.log(`Default year set to: ${defaultYear}`);
        return defaultYear; 

        //await updateColors(defaultYear);  // Ensure colors load only after years are set

    } catch (error) {
        console.error("Error loading years:", error);
        return null;
    }
}

// Function to load available scenarios into dropdown
async function loadScenarios() {
    try {
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
            option.textContent = scenario.toUpperCase();
            selector.appendChild(option);
        });

        // Set default scenario to ssp585 if available, otherwise use the first available scenario
        const defaultScenario = scenarios.includes("ssp585") ? "ssp585" : scenarios[0];
        selector.value = defaultScenario;

        return defaultScenario;

        console.log(`Loading initial variable data for scenario: ${defaultScenario}`);

        //await updateColors(selectedYear);  // Ensure colors load only after scenarios are set

    } catch (error) {
        console.error("Error loading scenarios:", error);
        return null;
    }
}

// Function to load available variables into dropdown
async function loadVariables() {
    const variableLabels = {
        pr: "Precipitación",
        et: "Evapotranspiración",
        rh: "Rendimiento hídrico"
    };
    try {
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
            option.textContent = variableLabels[variable] || variable.toUpperCase();
            selector.appendChild(option);
        });

        // Set default variable to pr if available, otherwise use the first available variable
        const defaultVariable = variables.includes("pr") ? "pr" : variables[0];
        selector.value = defaultVariable;

        return defaultVariable;

        console.log(`Loading initial data for variable: ${defaultVariable}`);

        //await updateColors(selectedYear);  // Ensure colors load only after variable is set

    } catch (error) {
        console.error("Error loading variables:", error);
        return null;
    }
}

// Function to load available data types 
async function loadTypes() {
    const typeLabels = {  
        abs: "Valor absoluto",
        dif: "Variación",
        pct: "Variación%"
    }
    try {
        const response = await fetch('/types');
        if (!response.ok) {
            throw new Error("Failed to fetch types.");
        }

        const types = await response.json();
        console.log("Types:", loadTypes);  // Debugging Log

        const container = document.getElementById("typeSelector"); 
        container.innerHTML = "";  // Clear existing buttons

        if (types.length === 0) {
            console.warn("No types found!");
            return;
        }

        types.forEach(type => {
            const button = document.createElement("button");  
            button.textContent = typeLabels[type] || type;
            button.className = "type-button";
            button.dataset.value = type;

            button.addEventListener("click", () => {  
                document.querySelectorAll(".type-button").forEach(btn =>
                    btn.classList.remove("active")
                );
                button.classList.add("active");
                updateVisualization();  
            });

            container.appendChild(button);  
        });

        // Set default type to abs if available, otherwise use the first available type
        const defaultType = types.includes("abs") ? "abs" : types[0];
        //selector.value = defaultType;
        const defaultButton = [...container.children].find(btn => btn.dataset.value === defaultType);  
        if (defaultButton) defaultButton.classList.add("active");

        return defaultType;

        console.log(`Loading initial data for type: ${defaultType}`);

        //await updateColors(selectedYear);  // Ensure colors load only after type is set

    } catch (error) {
        console.error("Error loading types:", error);
        return null;
    }
}

// Function to load available seasons into dropdown
async function loadSeasons() {
    const seasonLabels = {
        ann: "Año completo",
        pri: "Primavera (sep-nov)",
        ver: "Verano (dic-feb)",
        oto: "Otoño (mar-may)",
        inv: "Invierno (jun-ago)"
    };
    try {
        const response = await fetch('/seasons');
        if (!response.ok) {
            throw new Error("Failed to fetch seasons.");
        }

        const seasons = await response.json();
        console.log("Seasons in loadSeasons:", seasons);  // Debugging Log

        const selector = document.getElementById("seasonSelector");
        selector.innerHTML = "";  // Clear previous options

        if (seasons.length === 0) {
            console.warn("No seasons found!");
            return;
        }

        seasons.forEach(season => {
            const option = document.createElement("option");
            option.value = season;
            option.textContent = seasonLabels[season] || season;
            selector.appendChild(option);
        });

        // Set default season to ann if available, otherwise use the first available season
        const defaultSeason = seasons.includes("ann") ? "ann" : seasons[0];
        selector.value = defaultSeason;

        return defaultSeason;

        console.log(`Loading initial data for season: ${defaultSeason}`);

        //await updateColors(selectedYear);  // Ensure colors load only after season is set

    } catch (error) {
        console.error("Error loading seasons:", error);
        return null;
    }
}

// Function to load time series chart for a subcatchment
async function loadTimeSeriesData(sc_id) {
    const scenario = document.getElementById("scenarioSelector").value;  // Get selected scenario
    const variable = document.getElementById("variableSelector").value;  // Get selected variable
    const season = document.getElementById("seasonSelector").value;  // Get selected season
    try {
        const response = await fetch(`/timeseries/${scenario}/${variable}/${sc_id}/${season}`);
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
    const chartContainer = document.getElementById("chartContainer");
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

    document.getElementById("chartContainer").style.display = "block";
    console.log("Chart container shown:", document.getElementById("chartContainer").style.display); // Debugging log

    // Make sure the "x" button is visible 
    const closeButton = document.getElementById("closeChartButton");
    closeButton.style.display = "block";  // Ensure the button is visible
}

// Function to hide the chart
function closeChart() {
    const chartContainer = document.getElementById("chartContainer");
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
    const canvasContainer = document.getElementById('chartContainer');

    // Clear only the canvas, preserving the close button
    const oldCanvas = document.getElementById('timeSeriesChart');
    if (oldCanvas) {
        oldCanvas.remove(); // Remove old canvas
    }

    // Create a new canvas element
    const newCanvas = document.createElement('canvas');
    newCanvas.id = 'timeSeriesChart';
    newCanvas.className = 'chart-font'; 
    canvasContainer.appendChild(newCanvas);

    const ctx = newCanvas.getContext('2d');

    // Destroy the existing chart (if any)
    if (chart) {
        chart.destroy();
    }
    // Get computed font size from CSS
    const computedFontSize = parseFloat(getComputedStyle(newCanvas).fontSize) || 12;

    // Get the selected variable and scenario
    const variable = document.getElementById("variableSelector").value;  
    const scenario = document.getElementById("scenarioSelector").value;  

    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.dates,
            datasets: [
                {
                    label: 'Mediana',
                    data: data.medians,
                    borderColor: 'blue',
                    borderWidth: 1,
                    fill: false,
                    pointRadius: 0,
                    pointStyle: 'line'
                },
                {
                    label: 'Intervalo de confianza 90%',
                    data: data.lowerCIs,
                    borderColor: 'rgba(128,128,128,0.3)',
                    backgroundColor: 'rgba(200, 200, 200, 0.4)', // light grey fill
                    borderWidth: 1,
                    fill: '+1',
                    pointRadius: 0,
                    pointStyle: 'line'
                },
                {
                    label: '',
                    data: data.upperCIs,
                    borderColor: 'rgba(128,128,128,0.3)',
                    backgroundColor: 'rgba(200, 200, 200, 0.4)', 
                    borderWidth: 1,
                    fill: false,
                    pointRadius: 0,
                    pointStyle: 'line',
                    datalabels: false,
                    showLine: 1
                    //hidden: true
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
                        size: computedFontSize,
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
                            size: computedFontSize*.9
                        },
                        filter: function(item, chart) {
                            // Only show legend items for dataset index 0 and 1
                            return item.datasetIndex !== 2;
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
                    ticks: {
                        font: {
                            size: computedFontSize
                        }
                    },
                    title: {
                        display: false
                    }
                },
                y: {
                    ticks: {
                        font: {
                            size: computedFontSize
                        }
                    },
                    title: {
                        display: true,
                        text: `${variable.toUpperCase()} (mm)`,
                        font: {
                            size: computedFontSize
                        }                        
                    }
                }
            }
        }
    });
}

// Update the legend when the variable selector changes
document.getElementById("variableSelector").addEventListener("change", function() {
    //legend.remove();  // Remove the old legend     NOT NEEDED
    legend.addTo(map);
});

// Checkbox to show additional layer "Ríos"
document.getElementById("toggleLayerRios").addEventListener("change", async function (rios) {
  if (rios.target.checked) {
    // Fetch GeoJSON from the Flask backend
    const response = await fetch("/layer_rios");
    const data = await response.json();

    // Add GeoJSON layer to the map
    Layer_rios = L.geoJSON(data, {
      style: { color: "blue", weight: 1.2, opacity: 0.8 },
      onEachFeature: (feature, layer) => {
        if (feature.properties && feature.properties.name) {
          layer.bindPopup(feature.properties.name);
        }
      }
    }).addTo(map);
  } else {
    if (map.hasLayer(Layer_rios)) {
      map.removeLayer(Layer_rios);
    }
  }
});

// Additional layer "Carreteras"
document.getElementById("toggleLayerCarreteras").addEventListener("change", async function (carreteras) {
    if (carreteras.target.checked) {
        // Fetch GeoJSON from the Flask backend
        const response = await fetch("/layer_carreteras");
        const data = await response.json();

        // Add GeoJSON layer to the map  
        Layer_carreteras = L.geoJSON(data, {
            style: { color: "red", weight: 1.2, opacity: 0.8 },
            onEachFeature: (feature, layer) => {
                if (feature.properties && feature.properties.name) {
                    layer.bindPopup(feature.properties.name);
                }
            }
        }).addTo(map);
    } else {
      if (map.hasLayer(Layer_carreteras)) {
        map.removeLayer(Layer_carreteras);
      }
    }
});

// Additional layer "Departamentos"
document.getElementById("toggleLayerDepartamentos").addEventListener("change", async function (depa) {
    if (depa.target.checked) {
      // Fetch GeoJSON from the Flask backend
      const response = await fetch("/layer_departamentos");
      const data = await response.json();
  
      // Add GeoJSON layer to the map
      Layer_departamentos = L.geoJSON(data, {
        style: { color: "black", weight: 1.2, opacity: 0.8, fillColor: "transparent", fillOpacity: 0 },
        onEachFeature: (feature, layer) => {
          if (feature.properties && feature.properties.DEPARTAMEN) {
            const name = toTitleCase(feature.properties.DEPARTAMEN);
            layer.bindTooltip(name, {
                permanent: true,
                direction: "center",
                className: "layer-label"
              }).openTooltip();
          }
        }
      }).addTo(map);
    } else {
      if (map.hasLayer(Layer_departamentos)) {
        map.removeLayer(Layer_departamentos);
      }
    }
});

// Additional layer "Ámbitos AAA"
document.getElementById("toggleLayerAAA").addEventListener("change", async function (aaa) {
    if (aaa.target.checked) {
        // Fetch GeoJSON from the Flask backend
        const response = await fetch("/layer_AAA");
        const data = await response.json();

        // Add GeoJSON layer to the map  
        Layer_AAA = L.geoJSON(data, {
            style: { color: "purple", weight: 1.2, opacity: 0.8, fillColor: "transparent", fillOpacity: 0 },
            onEachFeature: (feature, layer) => {
                if (feature.properties && feature.properties.NAME_AAA) {
                    const name = toTitleCase(feature.properties.NAME_AAA);
                    layer.bindTooltip(name, {
                        permanent: true,
                        direction: "center",
                        className: "layer-label"
                      }).openTooltip();
                    layer.bindPopup(feature.properties.name);
                }
            }
        }).addTo(map);
    } else {
      if (map.hasLayer(Layer_AAA)) {
        map.removeLayer(Layer_AAA);
      }
    }
});

// Additional layer "Represas"
document.getElementById("toggleLayerRepresas").addEventListener("change", async function (represas) {
    if (represas.target.checked) {
      // Fetch GeoJSON from the Flask backend
      const response = await fetch("/layer_represas");
      const data = await response.json();
  
      // Add GeoJSON layer to the map
      Layer_represas = L.geoJSON(data, {
        style: { color: "black", weight: 1.2, opacity: 0.8},
        pointToLayer: function (feature, latlng) {
            return L.marker(latlng, {
              icon: L.divIcon({
                className: 'trapezoid-marker',
                html: '<div class="trapezoid"></div>', 
                iconSize: [8, 15],
                iconAnchor: [0, 0] 
              })
            });
        },
        onEachFeature: (feature, layer) => {
          if (feature.properties && feature.properties.name) {
            layer.bindPopup(feature.properties.name);
          }
        }
      }).addTo(map);
    } else {
      if (map.hasLayer(Layer_represas)) {
        map.removeLayer(Layer_represas);
      }
    }
});

// Additional layer "Fuentes"
document.getElementById("toggleLayerFuentes").addEventListener("change", async function (fuentes) {
    if (fuentes.target.checked) {
      // Fetch GeoJSON from the Flask backend
      const response = await fetch("/layer_fuentes");
      const data = await response.json();
  
      // Add GeoJSON layer to the map
      Layer_fuentes = L.geoJSON(data, {
        //style: { color: "black", weight: 1.2, opacity: 0.8 },
        pointToLayer: (feature, latlng) => {
            return L.circleMarker(latlng, {
              radius: 3,             // Size of the circle
              fillColor: "red",      // Fill color
              color: "red",          // Border color (optional)
              weight: 1,             // Border thickness
              opacity: 1,            // Border opacity
              fillOpacity: 0.8       // Fill opacity
            });
          },
        onEachFeature: (feature, layer) => {
          if (feature.properties && feature.properties.name) {
            layer.bindPopup(feature.properties.name);
          }
        }
      }).addTo(map);
    } else {
      if (map.hasLayer(Layer_fuentes)) {
        map.removeLayer(Layer_fuentes);
      }
    }
});

loadGeometry();  // Load geometry (subcatchments) initially
loadYears();  // Populate the dropdown with years
//setupTypeButtons();

