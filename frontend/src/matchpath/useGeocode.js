// hooks/useGeocode.js
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_GL_API;

export async function forwardGeocode(query) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    query
  )}.json?access_token=${MAPBOX_TOKEN}&limit=1`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.features && data.features.length > 0) {
    const place = data.features[0];
    return {
      lat: place.center[1],
      lng: place.center[0],
      address: place.place_name,
    };
  }
  return null;
}

export async function reverseGeocode(lat, lng) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&limit=1`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.features && data.features.length > 0) {
    const place = data.features[0];
    return {
      lat,
      lng,
      address: place.place_name,
    };
  }
  return null;
}
