import os
import csv
import json
from flask import Flask, jsonify, send_from_directory, Response, render_template
from flask_cors import CORS

# Initialize the Flask application
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})  # Allow frontend requests from any origin

# Data directories
geojson_dir = r"C:\Users\wkrin\DocsNonSync\vecc0-7\data\geojson"
base_mapdata_dir = fr"C:\Users\wkrin\DocsNonSync\vecc0-7\data\mapdata"
base_timeseries_dir = fr"C:\Users\wkrin\DocsNonSync\vecc0-7\data\timeseries"

@app.route('/')
def home():
    #return "Hello, Render!"
    return render_template("index.html")  

@app.route("/subcatchments", methods=["GET"])
def get_subcatchments():
    """Serve the static GeoJSON file containing subcatchment geometries"""
    print(f"Received request for GeoJSON file")
    return send_from_directory(geojson_dir, "subcatchments.geojson")

def read_mapdata(scenario, variable, year):
    """Read map data for the selected scenario, variable and year"""
    mapdata = {}
    mapdata_dir = os.path.join(base_mapdata_dir, scenario, variable)
    csv_file = os.path.join(mapdata_dir, f"{variable}_{year}_all_subcatchments.csv")

    if not os.path.exists(csv_file):
        print(f"File {csv_file} not found.")
        return {}  # Return an empty dict if the file doesn't exist

    with open(csv_file, mode="r") as file:
        reader = csv.DictReader(file)

        # Print column names for debugging
        first_row = next(reader, None)
        if first_row is None:
            print(f"CSV file {csv_file} is empty.")
            return {}

        print(f"Available columns in {csv_file}: {first_row.keys()}")  # Debugging

        if variable not in first_row:
            print(f"Error: Expected column '{variable}' not found in CSV. Check column names.")
            return {}  # Exit early if the expected column is missing

        # Reset file reader after checking the first row
        file.seek(0)
        reader = csv.DictReader(file)
        
        for row in reader:
            codigo = row["SC_ID"]
            mapdata[codigo] = float(row[variable])

    return mapdata

@app.route("/mapdata/<scenario>/<variable>/<year>", methods=["GET"])
def get_mapdata(scenario, variable, year):
    """API route to serve map data dynamically"""
    print(f"Received request for: Scenario = {scenario}, Variable = {variable}, Year = {year}")
    data = read_mapdata(scenario, variable, year)
    if not data:
        return jsonify({"error": f"Map data data for {variable}, {scenario}, {year} not found"}), 404
    return jsonify(data)

@app.route("/vector/<scenario>/<variable>/<year>", methods=["GET"])
def get_vector(scenario, variable, year):
    """Serve the GeoJSON file for the selected variable, year and scenario"""
    try:
        geojson_file = f"vector_{year}.geojson"
        geojson_path = os.path.join(geojson_dir, geojson_file)

        # Print the GeoJSON file path for debugging
        print(f"GeoJSON file path: {geojson_path}")

        # Check if the file exists
        if os.path.exists(geojson_path):
            print(f"GeoJSON file {geojson_file} exists!")
        else:
            print(f"GeoJSON file {geojson_file} does not exist!")

        # Load the GeoJSON data
        with open(geojson_path, 'r') as f:
            geojson_data = json.load(f)

        # Print the contents of geojson_data in the terminal for debugging
        print(f"GeoJSON Data: {geojson_data}")

        # Read the map data from the corresponding CSV file
        mapdata = read_mapdata(scenario, variable, year)

        # Attach mapdata values to the GeoJSON features
        for feature in geojson_data['features']:
            codigo = feature['properties']['SC_ID']
            feature['properties'][f'{variable}_{year}'] = mapdata.get(codigo, None)

        # Return the updated GeoJSON with mapdata values
        return jsonify(geojson_data)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/timeseries/<scenario>/<variable>/<sc_id>", methods=["GET"])
def get_timeseries(scenario, variable, sc_id):
    """Serve the time series CSV data for the selected subcatchment"""
    csv_path = os.path.join(base_timeseries_dir, scenario, variable, f"{variable}_{sc_id}.csv")
    print(f"Looking for file: {csv_path}")

    try:
        with open(csv_path, 'r') as file:
            csv_data = file.read()
        return Response(csv_data, mimetype="text/csv")
    except FileNotFoundError:
        return jsonify({"error": "Time series data not found"}), 404

@app.route("/years", methods=["GET"])
def get_years():
    """Return a list of available years"""
    years = ["1995", "2025", "2055", "2085"]
    return jsonify(years)

@app.route("/variables", methods=["GET"])
def get_variables():
    """Return a list of available variables"""
    variables = ["pr", "et", "rh"]
    return jsonify(variables)

@app.route("/scenarios", methods=["GET"])
def get_scenarios():
    """Return a list of available scenarios"""
    scenarios = ["ssp126", "ssp585"]
    return jsonify(scenarios)

#if __name__ == "__main__":
    #app.run(debug=True, port=5000)

if __name__ == '__main__':
    #port = int(os.environ.get('PORT', 5000))
    #app.run(host='0.0.0.0', port=port)
    app.run(host="0.0.0.0", port=10000, debug=True)