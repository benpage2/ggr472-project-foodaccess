mapboxgl.accessToken =
  "pk.eyJ1IjoiZHJpbm5pcmQiLCJhIjoiY201b2RyYXRhMGt1YTJvcHQ4ZjU4dDYycSJ9.jHNRKSu149-F5s157m1GwA"; // Add default public map token from your Mapbox account
const map = new mapboxgl.Map({
  container: "my-map", // map container ID
  style: "mapbox://styles/mapbox/streets-v11", // style URL
  center: [-79.41, 43.7], // starting position [lng, lat]
  zoom: 10,
});

const returnbutton = document.getElementById("returnbutton");

let hoveredPolygonId = null; // set variable to hold ID of polygon hovered on, initialize to null

let comparisonMode = false; //for comparison mode
let baseSelection = { chain: null, mode: "transit" }; //start values for comparison
let compSelection = { chain: null, mode: "transit" };

// listener to zoom the map back to full extents
returnbutton.addEventListener("click", (e) => {
  map.flyTo({
    center: [-79.41, 43.7],
    zoom: 10,
    essential: true,
  });
});

// function to stort ascending
const asc = (arr) => arr.sort((a, b) => a - b);

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

let traveltimesjson; // need this variable in several places, define it in the outermost scope

const updateFilter = (chain, mode) => {
  if (!comparisonMode) {
    // Regular Mode
    baseSelection.chain = chain;
    baseSelection.mode = mode;
    map.setFilter("res8-poly", [
      "all",
      [
        "all",
        ["==", ["get", "brand"], chain],
        ["==", ["get", "transport_mode"], mode],
      ],
    ]);
    map.setFilter("super-point", ["==", ["get", "brand"], chain]);
    updateLegendRegular();
  } else {
    // Comparison mode
    baseSelection.chain = chain;
    baseSelection.mode = mode;

    if (compSelection.chain !== null && compSelection.chain !== "0") {
      calculateDifference();
    }
  }
};

const calculateDifference = () => {
  // Calculate the difference between two layers
  map.setLayoutProperty("res8-poly", "visibility", "visible");

  const baseTimeLookup = {}; // data for base layer
  const compTimeLookup = {}; // data for comparison layer

  traveltimesjson.features.forEach((feature) => {
    // go through array for each element
    const props = feature.properties;
    const h3Index = props.h3index;

    if (
      props.brand === baseSelection.chain &&
      props.transport_mode === baseSelection.mode
    ) {
      baseTimeLookup[h3Index] = props.travel_time;
    }

    if (
      props.brand === compSelection.chain &&
      props.transport_mode === compSelection.mode
    ) {
      compTimeLookup[h3Index] = props.travel_time;
    }
  });

  const diffFeatures = traveltimesjson.features.map((feature) => {
    // Calculate difference
    const props = feature.properties;
    const h3Index = props.h3index;

    const newFeature = JSON.parse(JSON.stringify(feature)); // full copy bc error

    newFeature.properties.diff_time = baseTimeLookup[h3Index] - compTimeLookup[h3Index];
    return newFeature;
  });
  
  // Make the new GeoJSON
  const diffGeoJSON = {
    type: "FeatureCollection",
    features: diffFeatures,
  };

  map.getSource("res8-data").setData(diffGeoJSON);

  // update the filter
  map.setFilter("res8-poly", ["!=", ["get", "diff_time"], null]);

  map.setFilter("super-point", [
    "in",
    ["get", "brand"],
    ["literal", [baseSelection.chain, compSelection.chain]],
  ]);

  // use new colours
  updateDifferenceColors();
};
// New colours with breakpoint for difference
const updateDifferenceColors = () => {
  // Collect all difference values
  let diffValues = [];
  traveltimesjson.features.forEach((feature) => {
    console.log(feature.properties.diff_time)
    if (
      feature.properties.diff_time !== undefined &&
      feature.properties.diff_time !== null
    ) {
      diffValues.push(feature.properties.diff_time);
    }
  });

  // Range
  const minDiff = Math.min(...diffValues);
  const maxDiff = Math.max(...diffValues);

  // Create breakpoints
  const breakpoint1 = minDiff / 2;
  const breakpoint2 = 0;
  const breakpoint3 = maxDiff / 3;
  const breakpoint4 = (2 * maxDiff) / 3;

  map.setPaintProperty("res8-poly", "fill-color", [
    "step",
    ["get", "diff_time"],
    "#1a9641", // Dark green
    breakpoint1,
    "#a6d96a", // Light green
    breakpoint2,
    "#ffffbf", // Yellow
    breakpoint3,
    "#fdae61", // Orange
    breakpoint4,
    "#d7191c", // Red
  ]);

  // Update the legend
  updateLegendComparison(
    minDiff,
    breakpoint1,
    breakpoint2,
    breakpoint3,
    breakpoint4,
    maxDiff
  );
};

const updateLegendComparison = (min, b1, b2, b3, b4, max) => {
  // Clear legend
  const legend = document.getElementById("legend");
  legend.innerHTML = "<h6>travel time difference</h6>";

  const legendlabels = [
    min + " to " + b1 + " min faster",
    b1 + " to " + b2 + " min faster",
    b2 + " to " + b3 + " min slower",
    b3 + " to " + b4 + " min slower",
    b4 + " to " + max + " min slower",
  ];
  // maybe declare outside the function if I want to change?
  const legendcolors = [
    "#1a9641", // Dark green
    "#a6d96a", // Light green
    "#ffffbf", // Yellow
    "#fdae61", // Orange
    "#d7191c", // Red
  ];
  // Add items to legend
  legendlabels.forEach((label, i) => {
    const color = legendcolors[i];

    const item = document.createElement("div");
    const key = document.createElement("span");

    key.className = "legend-key";
    key.style.backgroundColor = color;

    const value = document.createElement("span");
    value.innerHTML = `${label}`;

    item.appendChild(key);
    item.appendChild(value);

    legend.appendChild(item);
  });
};

const updateComparisonFilter = (chain, mode) => {
  // Update the comparisons on click for the filter mode
  compSelection.chain = chain;
  compSelection.mode = mode;

  if (
    baseSelection.chain !== null &&
    baseSelection.chain !== "0" &&
    compSelection.chain !== null &&
    compSelection.chain !== "0"
  ) {
    calculateDifference();
  }
};

// Moved regular legend
const updateLegendRegular = () => {
  // Clear legend
  const legend = document.getElementById("legend");
  legend.innerHTML = "<h6>travel time</h6>";

  // Get all travel times for the current selection
  let ttimes = [];

  traveltimesjson.features.forEach((feature) => {
    const props = feature.properties;
    if (
      props.brand === baseSelection.chain &&
      props.transport_mode === baseSelection.mode
    ) {
      if (props.travel_time !== undefined && props.travel_time !== null) {
        ttimes.push(props.travel_time);
      }
    }
  });

  // If we have travel times, calculate quartiles
  if (ttimes.length > 0) {
    const q1 = quantile(ttimes, 0.25);
    const q2 = quantile(ttimes, 0.4);
    const q3 = quantile(ttimes, 0.6);
    const q4 = quantile(ttimes, 0.8);
    const upper = Math.max.apply(null, ttimes);

    // Define legend labels and colors (as in original code)
    let legendlabels = [
      "0-" + Math.floor(q1 - 1) + " minutes",
      Math.floor(q1) + "-" + Math.floor(q2 - 1) + " minutes",
      Math.floor(q2) + "-" + Math.floor(q3 - 1) + " minutes",
      Math.floor(q3) + "-" + Math.floor(q4 - 1) + " minutes",
      Math.floor(q4) + "-" + Math.floor(upper - 1) + " minutes",
      Math.floor(upper) + "+ minutes",
    ];

    const legendcolors = [
      "#fee5d9",
      "#fcbba1",
      "#fc9272",
      "#fb6a4a",
      "#de2d26",
      "#a50f15",
    ];

    // Rebuild the legend
    legendlabels.forEach((label, i) => {
      const color = legendcolors[i];

      const item = document.createElement("div");
      const key = document.createElement("span");

      key.className = "legend-key";
      key.style.backgroundColor = color;

      const value = document.createElement("span");
      value.innerHTML = `${label}`;

      item.appendChild(key);
      item.appendChild(value);

      legend.appendChild(item);
    });

    // Update the map layer colors
    map.setPaintProperty("res8-poly", "fill-color", [
      "step",
      ["get", "travel_time"],
      "#fee5d9",
      q1,
      "#fcbba1",
      q2,
      "#fc9272",
      q3,
      "#fb6a4a",
      q4,
      "#de2d26",
      upper,
      "#a50f15",
    ]);
  }
};

map.on("load", () => {
  // load custom image into the map style
  map.loadImage(
    "https://drinnnird-uoft.github.io/ggr472-project-foodaccess/img/blue-circle-small.png",
    (error, image) => {
      if (error) throw error;

      // Add the image to the map style.
      map.addImage("circle-blue-sm", image);
    }
  );

  //Add search control to map overlay
  //Requires plugin as source in HTML body
  map.addControl(
    new MapboxGeocoder({
      accessToken: mapboxgl.accessToken,
      mapboxgl: mapboxgl,
      countries: "ca", //Try searching for places inside and outside of canada to test the geocoder
    })
  );

  //Add zoom and rotation controls to the map.
  map.addControl(new mapboxgl.NavigationControl());
  // add geoJSON source files
  // torboundary-data - toronto boundary line
  // torneigh-data is toronto neighbourhoods (polygons)
  // supermarkets.geoJSON is a point feature collection of all the supermarkets in Toronto
  // all_travel_times_res8.geojson is the travel time data and hexgrids
  map.addSource("torboundary-data", {
    type: "geojson",
    data: "https://drinnnird-uoft.github.io/ggr472-project-foodaccess/data/tor_boundry.geojson",
  });

  map.addSource("torneigh-data", {
    type: "geojson",
    data: "https://drinnnird-uoft.github.io/ggr472-project-foodaccess/data/tor_neigh.geojson",
  });

  map.addSource("super-data", {
    type: "geojson",
    data: "https://drinnnird-uoft.github.io/ggr472-project-foodaccess/data/supermarkets-WGS84.geojson",
    generateId: true,
  });

  map.addSource("res8-data", {
    type: "geojson",
    data: "https://drinnnird-uoft.github.io/ggr472-project-foodaccess/data/all_travel_times_res8.geojson",
    generateId: true,
  });

  // map.addSource('res8-data', {
  //     type: 'vector',
  //     url: 'mapbox://drinnird.9u36r108',
  //     promoteId: {"all_travel_times_res8-2sh0kd":"id"}
  // })

  // draw features from geoJSON source files

  // draw boundary as grey lines
  map.addLayer({
    id: "torboundary-line",
    type: "line",
    source: "torboundary-data",
    paint: {
      "line-color": "#6D6D6D",
    },
  });

  // draw neighbourhoods as lighter grey lines
  map.addLayer({
    id: "torneigh-line",
    type: "line",
    source: "torneigh-data",
    paint: {
      "line-color": "#A2A2A2",
    },
  });

  // draw supermarkets as blue dots, adjusting dot size with zoom
  map.addLayer({
    id: "super-point",
    type: "circle",
    source: "super-data",
    paint: {
      "circle-color": "#4264fb",
      "circle-radius": 6,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
    filter: ["all", ["has", "brand"], ["!=", ["get", "brand"], null]], // show only supermarkets that have a brand set
  });

  // Create a popup, but don't add it to the map yet.
  const popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false,
  });

  // set up a mousemove event handler to toggle a feature state on the heatmap layer
  map.on("mousemove", "res8-poly", (e) => {
    map.getCanvas().style.cursor = "pointer"; // update the mouse cursor to a pointer to indicate clickability
    if (e.features.length > 0) {
      if (hoveredPolygonId !== null) {
        map.setFeatureState(
          { source: "res8-data", id: hoveredPolygonId },
          { hover: false }
        );
      }
      hoveredPolygonId = e.features[0].id;
      map.setFeatureState(
        { source: "res8-data", id: hoveredPolygonId },
        { hover: true }
      );
    }
  });

  // When the mouse leaves the heatmap layer, update the feature state of the
  // previously hovered feature.
  map.on("mouseleave", "res8-poly", () => {
    map.getCanvas().style.cursor = ""; // put the mouse cursor back to default
    if (hoveredPolygonId !== null) {
      map.setFeatureState(
        { source: "res8-data", id: hoveredPolygonId },
        { hover: false }
      );
    }
    hoveredPolygonId = null;
  });

  // note: Mapbox has a known issue with mouseenter and mouseleave for circle layers
  // the points are right-biased meaning you have to mouse over the right edge of the circle
  // rather than the center
  // attempted workaround using symbol layer instead of circle layer but had the same problem
  map.on("mouseenter", "super-point", (e) => {
    // Change the cursor style as a UI indicator.
    map.getCanvas().style.cursor = "pointer";

    // Copy coordinates array.
    const coordinates = e.features[0].geometry.coordinates.slice();
    const description = e.features[0].properties.brand;

    // Ensure that if the map is zoomed out such that multiple
    // copies of the feature are visible, the popup appears
    // over the copy being pointed to.
    // this is from the mapbox gl js documentation/examples
    if (["mercator", "equirectangular"].includes(map.getProjection().name)) {
      while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
        coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
      }
    }

    // Populate the popup and set its coordinates
    // based on the feature found.
    popup.setLngLat(coordinates).setHTML(description).addTo(map);
  });

  map.on("mouseleave", "super-point", () => {
    map.getCanvas().style.cursor = "";
    popup.remove();
  });

  // go through travel time data to build color ramp

  fetch(
    "https://drinnnird-uoft.github.io/ggr472-project-foodaccess/data/all_travel_times_res8.geojson"
  )
    .then((response) => response.json())
    .then((response) => {
      traveltimesjson = response;

      // get quartiles for choropleth scaling
      let ttimes = [];

      traveltimesjson.features.forEach((label, i) => {
        let feature = traveltimesjson.features[i];
        let props = feature.properties;
        // handle selected brand here
        let travtime = props.travel_time;
        ttimes.push(travtime);
      });

      const q1 = quantile(ttimes, 0.25);
      const q2 = quantile(ttimes, 0.4);
      const q3 = quantile(ttimes, 0.6);
      const q4 = quantile(ttimes, 0.8);
      const upper = Math.max.apply(null, ttimes);

      // build and render legend
      // declare legend variable using legend div tag
      const legend = document.getElementById("legend");

      let legendlabels = [
        "0-" + (q1 - 1) + " minutes",
        q1 + "-" + (q2 - 1) + " minutes",
        q2 + "-" + (q3 - 1) + " minutes",
        q3 + "-" + (q4 - 1) + " minutes",
        q4 + "-" + (upper - 1) + " minutes",
        upper + " minutes",
      ];

      const legendcolors = [
        "#fee5d9",
        "#fcbba1",
        "#fc9272",
        "#fb6a4a",
        "#de2d26",
        "#a50f15",
      ];

      // for each legend label, create a block to put the color and label in
      legendlabels.forEach((label, i) => {
        const color = legendcolors[i];

        const item = document.createElement("div"); //each layer gets a 'row' - this isn't in the legend yet, we do this later
        const key = document.createElement("span"); //add a 'key' to the row. A key will be the colour circle

        key.className = "legend-key"; //the key will take on the shape and style properties defined in css
        key.style.backgroundColor = color; // the background color is retreived from teh layers array

        const value = document.createElement("span"); //add a value variable to the 'row' in the legend
        value.innerHTML = `${label}`; //give the value variable text based on the label

        item.appendChild(key); //add the key (colour cirlce) to the legend row
        item.appendChild(value); //add the value to the legend row

        legend.appendChild(item); //add row to the legend
      });

      map.addLayer({
        id: "res8-poly",
        type: "fill",
        source: "res8-data",
        // 'source-layer' : 'all_travel_times_res8-2sh0kd',
        paint: {
          "fill-color": [
            "step",
            ["get", "travel_time"],
            "#fee5d9",
            q1,
            "#fcbba1",
            q2,
            "#fc9272",
            q3,
            "#fb6a4a",
            q4,
            "#de2d26",
            upper,
            "#a50f15",
          ],
          "fill-opacity": [
            // set the fill opacity based on a feature state which is set by a hover event listener
            "case",
            ["boolean", ["feature-state", "hover"], false],
            1, // opaque when hovered on
            0.5, // semi-transparent when not hovered on
          ],
          "fill-outline-color": "white",
        },
        //  'filter': ['all', ['has', 'travel_time'], ['!=', ['get', 'travel_time'], null]] // show only hexgrid points that have a travel time set
      });

      // hide the hexgrid at first until something is selected in the dropdown
      map.setLayoutProperty("res8-poly", "visibility", "none");

      // handle clicking on a hexgrid item
      map.on("click", "res8-poly", (e) => {
        // regular mode
        const coordinates = e.features[0].geometry.coordinates.slice();
        const travel_time = e.features[0].properties.travel_time;

        const sel_travel_mode = $(".iconfilter-clicked");
        if (sel_travel_mode.length == 1) {
          const pieces = sel_travel_mode[0].id.split("btn"); // icons are named with convention btnWalk, btnTransit etc
          if (travel_time !== undefined) {
            $("#click-info").html(
              "Travel time to " +
                $("#chain-select").val() +
                " by " +
                pieces[1] +
                " is " +
                travel_time +
                "m."
            );
          } else {
            $("#click-info").html(
              "Travel time to " +
                $("#chain-select").val() +
                " by " +
                pieces[1] +
                " is > 120m or could not be estimated."
            );
          }
        } else {
          // Comparison mode handler :)
          const diff_time = e.features[0].properties.diff_time;
          if (diff_time !== undefined && diff_time !== null) {
            let comparisonText = "";
            if (diff_time < 0) {
              comparisonText =
                "Travel to " +
                baseSelection.chain +
                " by " +
                baseSelection.mode +
                " is " +
                Math.abs(diff_time) +
                "m faster than to " +
                compSelection.chain +
                " by " +
                compSelection.mode;
            } else if (diff_time > 0) {
              comparisonText =
                "Travel to " +
                baseSelection.chain +
                " by " +
                baseSelection.mode +
                " is " +
                diff_time +
                "m slower than to " +
                compSelection.chain +
                " by " +
                compSelection.mode;
            } else {
              comparisonText = "Travel times are the same for both selections.";
            }
            $("#click-info").html(comparisonText);
          } else {
            $("#click-info").html(
              "Comparison data not available for this location."
            );
          }
        }
      });

      // click handler for selecting a brand inside map load because the map must be loaded to apply filters
      $("#chain-select").change(function () {
        // unhide the legend
        $("#legend").show();

        //removed nested map.on load? Maybe I did it yesterday and forgot

        let sel = $(this).val();
        console.log("Selected " + sel);

        // get currently selected travel method
        const sel_travel_mode = $(".iconfilter-clicked"); // the selected transit mode will have this class set
        let currmode = "transit";

        if (sel_travel_mode.length == 1) {
          const pieces = sel_travel_mode[0].id.split("btn"); // the icons are named btnBike, btnCar, etc...
          currmode = pieces[1].toLowerCase(); // the geoJSON file has all lowercase properties, so lowercase to match
        }

        if (sel !== 0) {
          // if something has been selected
          // show the hexgrid for that selection
          map.setLayoutProperty("res8-poly", "visibility", "visible");
          // Using new function
          updateFilter(sel, currmode);

          // big filter expression that means
          // show hexgrid cells that match the currently selected travel mode AND brand
          // AND also require that the travel time not be null or missing
          //   map.setFilter("res8-poly", [
          //     "all",
          //     [
          //       "all",
          //       // ['has', 'travel_time'],
          //       // ['!=', ['get', 'travel_time'], null],
          //       ["==", ["get", "brand"], sel],
          //       ["==", ["get", "transport_mode"], currmode],
          //     ],
          //   ]);

          //   map.setFilter("super-point", ["==", ["get", "brand"], sel]); // show only supermarkets that match requested brand
        }
      });

      $(document).ready(function () {
        // interactivity handling for the buttons that allow you to select which
        // mode of transport you want to calculate for
        // handle colorizing the buttons on hover and click

        // hide legend until a layer is selected
        $("#legend").hide();

        $("#btnWalk").hover(
          function () {
            $(this).addClass("iconfilter-hover");
          },
          function () {
            $(this).removeClass("iconfilter-hover");
          }
        );
        $("#btnBike").hover(
          function () {
            $(this).addClass("iconfilter-hover");
          },
          function () {
            $(this).removeClass("iconfilter-hover");
          }
        );
        $("#btnTransit").hover(
          function () {
            $(this).addClass("iconfilter-hover");
          },
          function () {
            $(this).removeClass("iconfilter-hover");
          }
        );
        $("#btnCar").hover(
          function () {
            $(this).addClass("iconfilter-hover");
          },
          function () {
            $(this).removeClass("iconfilter-hover");
          }
        );
        $("#btnWalk").click(function () {
          $(this).addClass("iconfilter-clicked");
          $("#btnBike").removeClass("iconfilter-clicked");
          $("#btnTransit").removeClass("iconfilter-clicked");
          $("#btnCar").removeClass("iconfilter-clicked");
          let chain = $("#chain-select").find(":selected").val();
          updateFilter(chain, "walk");
        });
        $("#btnBike").click(function () {
          $(this).addClass("iconfilter-clicked");
          $("#btnWalk").removeClass("iconfilter-clicked");
          $("#btnTransit").removeClass("iconfilter-clicked");
          $("#btnCar").removeClass("iconfilter-clicked");
          let chain = $("#chain-select").find(":selected").val();
          updateFilter(chain, "bike");
        });
        $("#btnTransit").click(function () {
          $(this).addClass("iconfilter-clicked");
          $("#btnBike").removeClass("iconfilter-clicked");
          $("#btnWalk").removeClass("iconfilter-clicked");
          $("#btnCar").removeClass("iconfilter-clicked");
          let chain = $("#chain-select").find(":selected").val();
          updateFilter(chain, "transit");
        });
        $("#btnCar").click(function () {
          $(this).addClass("iconfilter-clicked");
          $("#btnBike").removeClass("iconfilter-clicked");
          $("#btnTransit").removeClass("iconfilter-clicked");
          $("#btnWalk").removeClass("iconfilter-clicked");
          let chain = $("#chain-select").find(":selected").val();
          updateFilter(chain, "car");
        });

        // populate the brands dropdown with brands from the geoJSON file
        let superjson;
        let brands = [];
        let brandselect = document.getElementById("chain-select");

        // comparison button handlers
        $("#btnWalkComp").hover(
          function () {
            $(this).addClass("iconfilter-hover");
          },
          function () {
            $(this).removeClass("iconfilter-hover");
          }
        );

        $("#btnBikeComp").hover(
          function () {
            $(this).addClass("iconfilter-hover");
          },
          function () {
            $(this).removeClass("iconfilter-hover");
          }
        );

        $("#btnTransitComp").hover(
          function () {
            $(this).addClass("iconfilter-hover");
          },
          function () {
            $(this).removeClass("iconfilter-hover");
          }
        );

        $("#btnCarComp").hover(
          function () {
            $(this).addClass("iconfilter-hover");
          },
          function () {
            $(this).removeClass("iconfilter-hover");
          }
        );

        $("#btnWalkComp").click(function () {
          $(this).addClass("iconfilter-clicked");
          $("#btnBikeComp").removeClass("iconfilter-clicked");
          $("#btnTransitComp").removeClass("iconfilter-clicked");
          $("#btnCarComp").removeClass("iconfilter-clicked");
          updateComparisonFilter($("#chain-select-comp").val(), "walk");
        });

        $("#btnBikeComp").click(function () {
          $(this).addClass("iconfilter-clicked");
          $("#btnWalkComp").removeClass("iconfilter-clicked");
          $("#btnTransitComp").removeClass("iconfilter-clicked");
          $("#btnCarComp").removeClass("iconfilter-clicked");
          updateComparisonFilter($("#chain-select-comp").val(), "bike");
        });

        $("#btnTransitComp").click(function () {
          $(this).addClass("iconfilter-clicked");
          $("#btnBikeComp").removeClass("iconfilter-clicked");
          $("#btnWalkComp").removeClass("iconfilter-clicked");
          $("#btnCarComp").removeClass("iconfilter-clicked");
          updateComparisonFilter($("#chain-select-comp").val(), "transit");
        });

        $("#btnCarComp").click(function () {
          $(this).addClass("iconfilter-clicked");
          $("#btnBikeComp").removeClass("iconfilter-clicked");
          $("#btnTransitComp").removeClass("iconfilter-clicked");
          $("#btnWalkComp").removeClass("iconfilter-clicked");
          updateComparisonFilter($("#chain-select-comp").val(), "car");
        });

        // Set up change handler for comparison chain dropdown
        $("#chain-select-comp").change(function () {
          let sel = $(this).val();

          // Get currently selected travel method for comparison
          const sel_travel_mode = $("#comparison-controls .iconfilter-clicked");
          let currmode = "transit";
          if (sel_travel_mode.length == 1) {
            const pieces = sel_travel_mode[0].id.split("btn");
            currmode = pieces[1].split("Comp")[0].toLowerCase();
          }

          if (sel !== "0") {
            updateComparisonFilter(sel, currmode);
          }
        });

        fetch(
          "https://drinnnird-uoft.github.io/ggr472-project-foodaccess/data/supermarkets-WGS84.geojson"
        )
          .then((response) => response.json())
          .then((response) => {
            superjson = response;
            // get a set of unique grocery chains
            let supermarkets = superjson.features;

            supermarkets.forEach((label, i) => {
              let item = supermarkets[i];
              if (
                item.properties.brand !== undefined &&
                item.properties.brand !== null
              ) {
                if (!brands.includes(item.properties.brand)) {
                  brands.push(item.properties.brand);
                }
              }
            });

            brands.sort();

            // Add to dropdown
            brands.forEach((label, i) => {
              let opt = document.createElement("option");
              opt.text = opt.value = label;
              brandselect.add(opt);
            });
            // Get the comparison dropdown element
            let brandSelectComp = document.getElementById("chain-select-comp");

            // Populate the comparison dropdown with the same options
            brands.forEach((label, i) => {
              let optComp = document.createElement("option");
              optComp.text = optComp.value = label;
              brandSelectComp.add(optComp);
            });
          });

        document
          .getElementById("compareToggle")
          .addEventListener("click", () => {
            comparisonMode = !comparisonMode;

            if (comparisonMode) {
              // Show comparison controls
              document.getElementById("comparison-controls").style.display =
                "block";
              document.getElementById("compareToggle").innerText =
                "Disable Comparison Mode";
              document
                .getElementById("compareToggle")
                .classList.remove("btn-outline-secondary");
              document
                .getElementById("compareToggle")
                .classList.add("btn-secondary");

              // If both selections are already made, calculate difference
              if (
                baseSelection.chain !== null &&
                baseSelection.chain !== "0" &&
                compSelection.chain !== null &&
                compSelection.chain !== "0"
              ) {
                calculateDifference();
              }
            } else {
              // Hide comparison controls
              document.getElementById("comparison-controls").style.display =
                "none";
              document.getElementById("compareToggle").innerText =
                "Enable Comparison Mode";
              document
                .getElementById("compareToggle")
                .classList.remove("btn-secondary");
              document
                .getElementById("compareToggle")
                .classList.add("btn-outline-secondary");

              // Restore regular display if a chain is selected
              if (baseSelection.chain !== null && baseSelection.chain !== "0") {
                updateFilter(baseSelection.chain, baseSelection.mode);
              }
            }
          });
      });
    });
});