mapboxgl.accessToken = 'pk.eyJ1IjoiZHJpbm5pcmQiLCJhIjoiY201b2RyYXRhMGt1YTJvcHQ4ZjU4dDYycSJ9.jHNRKSu149-F5s157m1GwA'
// Global Variables
let traveltimesjson;

const homeCoords = [-79.37, 43.71];
const homeZoom = 10;

const map = new mapboxgl.Map({
    container: 'my-map', // map container ID
    style: 'mapbox://styles/mapbox/streets-v11', // style URL
    center: homeCoords, // starting position [lng, lat]
    zoom: homeZoom
});

let hoveredPolygonId = null; // set variable to hold ID of polygon hovered on, initialize to null


// function to stort ascending
const asc = arr => arr.sort((a, b) => a - b);

// function to find quantiles, for choropleth mapping
const quantile = (arr, q) => {
    const sorted = asc(arr);
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] !== undefined) {
        return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    } else {
        return sorted[base];
    }
};

// get unique brands from the superjson
const extractBrands = (supermarketjson) => {
  brandLst = [];
  // get a set of unique grocery chains
  let supermarkets = supermarketjson.features;
  supermarkets.forEach((label, i) => {
      let item = supermarkets[i];
      if(item.properties.brand !== undefined && item.properties.brand !== null) {
          if(!brandLst.includes(item.properties.brand)) {
              brandLst.push(item.properties.brand)
          }
      }
  });
  return brandLst.sort()
}

// populate a dropdown with brands
// a f-n b/c will be used twice
const populateDropdown = (brandList, dropDownElement) => {
  brandList.forEach((label) => {
    let opt = document.createElement('option');
    opt.text = opt.value = label;
    dropDownElement.add(opt)
  })
}

function setupHoverInteractions() {
    // Removing old hover interactions (else error)
    map.off('mousemove', 'res8-poly');
    map.off('mouseleave', 'res8-poly');

    // Original mouse move
    // set up a mousemove event handler to toggle a feature state on the heatmap layer
    map.on('mousemove', 'res8-poly', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        if (e.features.length > 0) {
            if (hoveredPolygonId !== null) {
                map.setFeatureState(
                    { source: 'filtered-res8-data', id: hoveredPolygonId },
                    { hover: false }
                );
            }
            hoveredPolygonId = e.features[0].id;
            map.setFeatureState(
                { source: 'filtered-res8-data', id: hoveredPolygonId },
                { hover: true }
            );
        }
    });

    // Original mouseleave 
    // When the mouse leaves the heatmap layer, update the feature state of the
    // previously hovered feature.
    map.on('mouseleave', 'res8-poly', () => {
        map.getCanvas().style.cursor = '';
        if (hoveredPolygonId !== null) {
            map.setFeatureState(
                { source: 'filtered-res8-data', id: hoveredPolygonId },
                { hover: false }
            );
        }
        hoveredPolygonId = null;
    });
}

function filterTravelTimes (chain, mode) {
    // Exit if not loaded yet and log
    if (!traveltimesjson) {
        console.log("Travel time json not loaded - filterTravelTimes");
        return;
    }

    let filteredGeojson = {
        type: traveltimesjson.type,
        name: "filtered_travel_times",
        crs: traveltimesjson.crs,
        features: []
    };

    filteredGeojson.features = traveltimesjson.features.filter(feature => {
        const properties = feature.properties;

        return properties.brand === chain && properties.transport_mode === mode;
    });

    return filteredGeojson
}

function getQuartiles(geojson){
        // get quartiles for choropleth scaling
        let ttimes = [];

        geojson.features.forEach((label, i) => {
            let feature = geojson.features[i];
            let props = feature.properties;
            // handle selected brand here
            let travtime = props.travel_time;
            // Don't push nulls to array
            if (travtime !== null && travtime !== undefined) {
                ttimes.push(travtime);
            }    
        })
        
        // Rounded 
        const q1 = Math.round(quantile(ttimes, 0.25));
        const q2 = Math.round(quantile(ttimes, 0.4));
        const q3 = Math.round(quantile(ttimes, 0.6));
        const q4 = Math.round(quantile(ttimes, 0.8));
        const upper = Math.round(Math.max.apply(null, ttimes));

        return {q1, q2, q3, q4, upper}
}

function buildQuartLegend(bounds){
    // build and render legend
    // declare legend variable using legend div tag
    const legend = document.getElementById("legend");

    // Clear previous legend items
    legend.innerHTML = '<h6>travel time</h6>';

    let legendlabels = [
        '0-' + (bounds.q1-1) + ' minutes',
        bounds.q1 + '-' + (bounds.q2-1) + ' minutes',
        bounds.q2 + '-' + (bounds.q3-1) + ' minutes',
        bounds.q3 + '-' + (bounds.q4-1) + ' minutes',
        bounds.q4 + '-' + (bounds.upper-1) + ' minutes',
        bounds.upper + '+ minutes',
        'No data available'
    ]

    const legendcolors = [
        '#fee5d9',
        '#fcbba1',
        '#fc9272',
        '#fb6a4a',
        '#de2d26',
        '#a50f15',
        '#3f3f3f' //added null to the legend
    ]

    legendlabels.forEach((label, i) => {
        const color = legendcolors[i];

        const item = document.createElement('div') //each layer gets a 'row' - this isn't in the legend yet, we do this later
        const key = document.createElement('span') //add a 'key' to the row. A key will be the colour circle

        key.className = 'legend-key'; //the key will take on the shape and style properties defined in css
        key.style.backgroundColor = color; // the background color is retreived from teh layers array

        const value = document.createElement('span'); //add a value variable to the 'row' in the legend
        value.innerHTML = `${label}`; //give the value variable text based on the label

        item.appendChild(key); //add the key (colour cirlce) to the legend row
        item.appendChild(value); //add the value to the legend row
    
        legend.appendChild(item); //add row to the legend
    })

    $("#legend").show();
}

function addQuartLayer(geojson, bounds){

    // Removing old layer if it exsists
    if (map.getLayer('res8-poly')) {
        map.removeLayer('res8-poly');
    }

    // Making source
    if (map.getSource('filtered-res8-data')) {
        map.getSource('filtered-res8-data').setData(geojson);
    } else {
        map.addSource('filtered-res8-data', {
            type: 'geojson',
            data: geojson,
            'generateId': true
        });
    }

    map.addLayer({
        'id': 'res8-poly', // kept name consitent for event handlers
        'type': 'fill',
        'source': 'filtered-res8-data',
        'paint': {
            "fill-color": [
                "case", // case sets null value colour
                ["==", ["get", "travel_time"], null],
                "#3f3f3f",
                ["step",
                    ["get", "travel_time"],
                    "#fee5d9",
                    bounds.q1, "#fcbba1",
                    bounds.q2, "#fc9272",
                    bounds.q3, "#fb6a4a",
                    bounds.q4, "#de2d26",
                    bounds.upper, "#a50f15"
                ]
            ],
            'fill-opacity': [
                'case',
                ['boolean', ['feature-state', 'hover'], false],
                1,  // opaque when hovered on
                0.5 // semi-transparent when not hovered on
            ],
            'fill-outline-color': 'white'
        }
    });
    
    // Getting hover to work again
    setupHoverInteractions();

}

function updateTravelTimes(chain, mode) {
    console.log('UpdateTravelTimes chain', chain)
    console.log('UpdateTravelTimes mode', mode)
    // Check if traveltimejson exists
    if (!traveltimesjson) {
        console.log("Travel time json not loaded - updateTravelTimes");
        return null;
    }

    filteredGeojson = filterTravelTimes(chain, mode)
    console.log(filteredGeojson)
    bounds = getQuartiles(filteredGeojson)
    console.log(bounds)
    buildQuartLegend(bounds)
    
    // moved supermarket filter
    map.setFilter('super-point', ['==', ['get','brand'], chain])

    addQuartLayer(filteredGeojson, bounds)
}

function updateVisualization() {
    // Is comparison switch
    const isComparisonEnabled = $("#comparisonSwitch").prop("checked");
    
    const baseChain = $("#chain-select").val();
    let baseMode = "transit"; // Default

    // Handeling so many buttons is a pain,
    // Similar to older implimentation
    $(".iconfilter.base.iconfilter-clicked").each(function() {
        baseMode = $(this).attr("id").replace("btn", "").toLowerCase();
    });
    
    const compChain = $("#compChain-select").val();
    
    // Same as above, but for other mode
    let compMode = "transit"; // Default
    $(".iconfilter.comp.iconfilter-clicked").each(function() {
        // Extract the mode from the button ID by removing "btn" and "Comp"
        let buttonId = $(this).attr("id");
        compMode = buttonId.replace("btn", "").replace("Comp", "").toLowerCase();
    });
    
    // Stopping issues
    if (!traveltimesjson) {
        console.log("Travel time json not loaded - updateVisualization");
        return;
    }

    console.log("- Base chain:", baseChain, "Base mode:", baseMode);
    console.log("- Comparison enabled:", isComparisonEnabled);
    console.log("- Comp chain:", compChain, "Comp mode:", compMode);

    if (isComparisonEnabled){
        console.log("Is comp mode")
        // Preventing more issues
        if (compChain === "0"){
            console.log("No comp chain selected");
            updateTravelTimes(baseChain, baseMode)
        return;
        }
        updateComparisonMode(baseChain, baseMode, compChain, compMode)
    }
    else{
        console.log("Is not comp mode")
        if (baseChain === "0") {
            console.log("No base chain selected");
            return;
        }
        // Draw standard Map
        updateTravelTimes(baseChain, baseMode)
    }
} 

function createDifferenceJson(baseJson, compJson) {
    // Create deep copy
    const differenceJson = JSON.parse(JSON.stringify(baseJson));
    
    const compFeatureMap = {};
    compJson.features.forEach(feature => {
      const id = feature.properties.id;
      if (id !== undefined) {
        compFeatureMap[id] = feature;
      }
    });
    
    
    
    differenceJson.features.forEach(feature => {
      const id = feature.properties.id;
      
      if (id !== undefined && compFeatureMap[id]) {
        const compFeature = compFeatureMap[id];
        
        const baseTime = feature.properties.travel_time;
        const compTime = compFeature.properties.travel_time;
        
        
        // Calculate difference /  set to null 
        if (baseTime === null || compTime === null) {
          feature.properties.travel_time = null;
        } else {
          feature.properties.travel_time = baseTime - compTime;
        }
      } else {
        // No matching feature found, sometimes happens?
        feature.properties.travel_time = null;
      }
    });
    
    return differenceJson;
  }

function buildDiffLegend(bounds, baseChain, compChain){
    const legend = document.getElementById("legend")

    // Clear previous legend items
    legend.innerHTML = '<h6>travel time</h6>';

    const legendLabels = [
        '20+ min closer to ' + baseChain,
        '20-11 min closer to ' + baseChain,
        '1-10 min closer to' + baseChain,
        '0 min difference',
        '1-9 min closer to ' + compChain,
        '10-19 min closer to ' + compChain,
        '20+ min closer to ' + compChain,
        'No data available'
    ];

    const legendColors = [
        '#4A148C', // deep purple
        '#7B1FA2',
        '#CE93D8',
        '#FFFFFF',
        '#FFCC80',
        '#F57C00',
        '#E65100',
        '#3f3f3f' // ornage
    ];

    legendLabels.forEach((label, i) => {
        const color = legendColors[i];

        const item = document.createElement('div') //each layer gets a 'row' - this isn't in the legend yet, we do this later
        const key = document.createElement('span') //add a 'key' to the row. A key will be the colour circle

        key.className = 'legend-key'; //the key will take on the shape and style properties defined in css
        key.style.backgroundColor = color; // the background color is retreived from teh layers array

        const value = document.createElement('span'); //add a value variable to the 'row' in the legend
        value.innerHTML = `${label}`; //give the value variable text based on the label

        item.appendChild(key); //add the key (colour cirlce) to the legend row
        item.appendChild(value); //add the value to the legend row
    
        legend.appendChild(item); //add row to the legend
    })

    $("#legend").show();
}

function addDiffLayer(geojson, bounds){

    // Removing old layer if it exsists
    if (map.getLayer('res8-poly')) {
        map.removeLayer('res8-poly');
    }

    // Making source
    if (map.getSource('filtered-res8-data')) {
        map.getSource('filtered-res8-data').setData(geojson);
    } else {
        map.addSource('filtered-res8-data', {
            type: 'geojson',
            data: geojson,
            'generateId': true
        });
    }
    const legendColors = [
        '#4A148C', // deep purple
        '#7B1FA2',
        '#CE93D8',
        '#FFFFFF',
        '#FFCC80',
        '#F57C00',
        '#E65100',
        '#3f3f3f' // ornage
    ];

    map.addLayer({
        'id': 'res8-poly', // kept name consistent for event handlers
        'type': 'fill',
        'source': 'filtered-res8-data',
        'paint': {
            "fill-color": [
                "case", // case sets null value colour
                ["==", ["get", "travel_time"], null],
                legendColors[7], // Use the last color (#3f3f3f) for null values
                ["step",
                    ["get", "travel_time"],
                    legendColors[0], // deep purple for values below lowerMin
                    bounds.lowerMin, legendColors[1],
                    bounds.lowerMid, legendColors[2],
                    bounds.midpoint, legendColors[3], // White at the midpoint
                    bounds.upperMid, legendColors[4],
                    bounds.upperMax, legendColors[6]  // Use E65100 for values >= upperMax
                ]
            ],
            'fill-opacity': [
                'case',
                ['boolean', ['feature-state', 'hover'], false],
                1,  // opaque when hovered on
                0.5 // semi-transparent when not hovered on
            ],
            'fill-outline-color': 'white'
        }
    });
    
    // Getting hover to work again
    setupHoverInteractions();
}

function updateComparisonMode(baseChain, baseMode, compChain, compMode) {
    if (!traveltimesjson) {
        console.log("Travel time json not loaded - updateComparisonMode");
        return;
    }
    console.log('chain, mode', compChain, compMode)
    let filteredBase = filterTravelTimes(baseChain, baseMode);

    
    let filteredComp = filterTravelTimes(compChain, compMode);
    
    const bounds = {
        lowerMin: -20,
        lowerMid: -10,
        midpoint: 0,
        upperMid: 10,
        upperMax: 20
    };

    console.log('Building Diff Json');
    let diffJson = createDifferenceJson(filteredBase, filteredComp);
    console.log('Building Diff Legend');
    buildDiffLegend(bounds, baseChain, compChain)
    addDiffLayer(diffJson, bounds)
}

function setupTransportButtonHandlers() {
    // Romobes highlighting based on group set in html

    // Base buttons
    $(".iconfilter.base").click(function() {
        $(".iconfilter.base").removeClass("iconfilter-clicked");
        
        $(this).addClass("iconfilter-clicked");
        
        updateVisualization();
    });
    
    // Comparison buttons
    $(".iconfilter.comp").click(function() {
        $(".iconfilter.comp").removeClass("iconfilter-clicked");
        
        $(this).addClass("iconfilter-clicked");
        
        // Update visualization
        updateVisualization();
    });
}

function setupChainDropdownHandlers() {
    // Updates on chain change
    
    // Base 
    $("#chain-select").change(function() {
        updateVisualization();
    });
    
    // Comp
    $("#compChain-select").change(function() {
        updateVisualization();
    });
}

function setupComparisonSwitchHandler() {
    // Added disabled look to comparison buttons
    $("#comparisonSwitch").change(function() {
        const isChecked = $(this).prop("checked");
        
        if (isChecked) {
            $(".iconfilter.comp").prop("disabled", false);
            $("#compChain-select").prop("disabled", false);
            
            $(".comp").parent().show();
        } else {
            $(".iconfilter.comp").prop("disabled", true);
            $("#compChain-select").prop("disabled", true);
            
            $(".comp").parent().hide();
        }
        
        updateVisualization();
    });
}



// Home button class based on mapBox IControl example
class HomeButtonControl {
    constructor() {
      this._map = null;
      this._container = null;
      this._homeCoords = homeCoords;
      this._homeZoom = homeZoom;
    }
  
    onAdd(map) {
      this._map = map;
      this._container = document.createElement('div');
      this._container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
      
      const button = document.createElement('button');
      button.type = 'button';
      button.title = 'Reset Map View';
      button.className = 'bi bi-house-door';
      button.style.padding = '6px';
      button.style.fontSize = '16px';
      
      button.addEventListener('click', () => {
        this._map.flyTo({
          center: this._homeCoords,
          zoom: this._homeZoom,
          essential: true
        });
      });
      
      this._container.appendChild(button);
      return this._container;
    }
  
    onRemove() {
      this._container.parentNode.removeChild(this._container);
      this._map = null;
    }
}

map.on('load', () => {

    // load custom image into the map style
    map.loadImage(
        'https://drinnnird-uoft.github.io/ggr472-project-foodaccess/img/blue-circle-small.png',
        (error, image) => {
            if (error) throw error;

            // Add the image to the map style.
            map.addImage('circle-blue-sm', image);
    });

    //Add search control to map overlay
    //Requires plugin as source in HTML body
    map.addControl(
        new MapboxGeocoder({
            accessToken: mapboxgl.accessToken,
            mapboxgl: mapboxgl,
            countries: "ca" //Try searching for places inside and outside of canada to test the geocoder
        })
    );

    //Add zoom and rotation controls to the map.
    map.addControl(new mapboxgl.NavigationControl());
    // Add home button
    map.addControl(new HomeButtonControl(), 'top-right');
    // add geoJSON source files
    // torboundary-data - toronto boundary line
    // torneigh-data is toronto neighbourhoods (polygons)
    // supermarkets.geoJSON is a point feature collection of all the supermarkets in Toronto
    // all_travel_times_res8.geojson is the travel time data and hexgrids
    map.addSource('torboundary-data', {
        type: 'geojson',
        data: 'https://drinnnird-uoft.github.io/ggr472-project-foodaccess/data/tor_boundry.geojson'
    });

    map.addSource('torneigh-data', {
        type: 'geojson',
        data: 'https://drinnnird-uoft.github.io/ggr472-project-foodaccess/data/tor_neigh.geojson'
    });

    map.addSource('super-data', {
        type: 'geojson',
        data: 'https://drinnnird-uoft.github.io/ggr472-project-foodaccess/data/supermarkets-WGS84.geojson',
        'generateId' : true
    })

    map.addSource('res8-data', {
        type: 'geojson',
        data: 'https://drinnnird-uoft.github.io/ggr472-project-foodaccess/data/all_travel_times_res8.geojson',
        'generateId' : true
    })

    // draw boundary as grey lines
    map.addLayer({
        'id': 'torboundary-line',
        'type': 'line',
        'source': 'torboundary-data',
        'paint': {
            'line-color' : '#6D6D6D'
        }
    });

    // draw neighbourhoods as lighter grey lines
    map.addLayer({
        'id' : 'torneigh-line',
        'type' : 'line',
        'source' : 'torneigh-data',
        'paint' : {
            'line-color' : '#A2A2A2'
        }
    })

    // draw supermarkets as blue dots, adjusting dot size with zoom
    map.addLayer({
        'id' : 'super-point',
        'type' : 'circle',
        'source' : 'super-data',
        'paint': {
                'circle-color': '#4264fb',
                'circle-radius': 6,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff'
        },
        'filter': ['all', ['has', 'brand'], ['!=', ['get', 'brand'], null]] // show only supermarkets that have a brand set
    })

    // Create a popup, but don't add it to the map yet.
    const popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false
    });

    // refactored hover iteractions due to bug
    setupHoverInteractions();

    // note: Mapbox has a known issue with mouseenter and mouseleave for circle layers
    // the points are right-biased meaning you have to mouse over the right edge of the circle
    // rather than the center
    // attempted workaround using symbol layer instead of circle layer but had the same problem
    map.on('mouseenter', 'super-point', (e) => {
        // Change the cursor style as a UI indicator.
        map.getCanvas().style.cursor = 'pointer';

        // Copy coordinates array.
        const coordinates = e.features[0].geometry.coordinates.slice();
        const description = e.features[0].properties.brand;

        // Ensure that if the map is zoomed out such that multiple
        // copies of the feature are visible, the popup appears
        // over the copy being pointed to.
        // this is from the mapbox gl js documentation/examples
        if (['mercator', 'equirectangular'].includes(map.getProjection().name)) {
            while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
                coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
            }
        }

        // Populate the popup and set its coordinates
        // based on the feature found.
        popup.setLngLat(coordinates).setHTML(description).addTo(map);
    });

    map.on('mouseleave', 'super-point', () => {
        map.getCanvas().style.cursor = '';
        popup.remove();
    });

    fetch('https://drinnnird-uoft.github.io/ggr472-project-foodaccess/data/all_travel_times_res8.geojson')
    .then(response => response.json())
    .then(response => {
        traveltimesjson = response;

        // handle clicking on a hexgrid item
        map.on('click', 'res8-poly', (e) => {
            const coordinates = e.features[0].geometry.coordinates.slice();
            const travel_time = e.features[0].properties.travel_time;

            const sel_travel_mode = $(".iconfilter-clicked");
            if(sel_travel_mode.length == 1) {
                const pieces = sel_travel_mode[0].id.split("btn"); // icons are named with convention btnWalk, btnTransit etc
                if (travel_time !== undefined) {
                    $("#click-info").html("Travel time to " + $("#chain-select").val() + " by " + pieces[1] + " is " + travel_time + "m.");
                } else {
                    $("#click-info").html("Travel time to " + $("#chain-select").val() + " by " + pieces[1] + " is > 120m or could not be estimated.");
                }
                
            }
        })
        // Chain select moved to setupChainDropdownHandlers

    })
})

$(document).ready(function() {
    // interactivity handling for the buttons that allow you to select which
    // mode of transport you want to calculate for
    // handle colorizing the buttons on hover and click
    
    // hide legend until a layer is selected
    $("#legend").hide();

    setupTransportButtonHandlers();
    setupChainDropdownHandlers();
    setupComparisonSwitchHandler();

    // Hide comparison controls
    if (!$("#comparisonSwitch").prop("checked")) {
        $(".comp").parent().hide();
    }

    // populate the brands dropdown with brands from the geoJSON file
    let superjson;
    let brands = [];
    let brandselect = document.getElementById("chain-select");
    let compselect = document.getElementById("compChain-select")

    fetch('https://drinnnird-uoft.github.io/ggr472-project-foodaccess/data/supermarkets-WGS84.geojson')
    .then(response => response.json())
    .then(response => {
        superjson = response;
        // get a set of unique grocery chains

        brands = extractBrands(superjson)
        populateDropdown(brands, brandselect)
        populateDropdown(brands, compselect)
    });
})