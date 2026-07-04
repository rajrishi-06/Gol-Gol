import mapboxgl from "mapbox-gl";
import { MAPBOX_TOKEN } from "./geocoding";

// Apply the token once for every GL map in the app.
mapboxgl.accessToken = MAPBOX_TOKEN;

/** Themed map styles (kept in one place so every map looks consistent). */
export const MAP_STYLE = {
  streets: "mapbox://styles/mapbox/streets-v12",
  navigation: "mapbox://styles/mapbox/navigation-day-v1",
};

/**
 * Build a Mapbox marker backed by an image element. Popups use `setText`
 * (never `setHTML`) so user-supplied names can never inject markup — this
 * closes the XSS hole that existed in the old marker helpers.
 */
export function createImageMarker({ iconPath, coords, map, size = 40, popupText }) {
  const el = document.createElement("div");
  const img = document.createElement("img");
  img.src = iconPath;
  img.alt = "";
  img.width = size;
  img.height = size;
  img.style.width = `${size}px`;
  img.style.height = `${size}px`;
  img.style.filter = "drop-shadow(0 4px 8px rgba(0,0,0,0.25))";
  el.appendChild(img);

  const marker = new mapboxgl.Marker({ element: el }).setLngLat(coords);
  if (popupText) marker.setPopup(new mapboxgl.Popup({ offset: 20 }).setText(popupText));
  return marker.addTo(map);
}

/** Marker for a driver's vehicle, resolved from its `vehicleType`. */
export function createVehicleMarker({ vehicleType, coords, map, popupText }) {
  return createImageMarker({
    iconPath: `/icons/${vehicleType}.svg`,
    coords,
    map,
    size: 42,
    popupText,
  });
}

export { mapboxgl };
