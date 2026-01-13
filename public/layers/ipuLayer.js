// public/layers/ipuLayer.js
// =====================================================
// IPU — Índice de Proximidad Urbana (suelo artificial)
// MODO: solo cálculo (NO dibuja capa)
// Carga GeoJSON pesado bajo demanda (lazy), solo al abrir popup.
// Requiere: Leaflet (L), Turf (turf), RBush (rbush) ya en window.
// =====================================================

(function () {
  const STATE = {
    ready: false,
    loading: false,
    features: [],
    index: null,
  };

  const CFG = {
    url: "layers/suelo_artificial_espana.geojson", // relativo a /public/
    maxSearchMeters: 8000,   // radio para buscar candidatos
    maxSamplePoints: 220,    // muestreo de borde (rendimiento)
  };

  function getFirstCoord(feature) {
  try {
    const g = feature?.geometry;
    if (!g) return null;
    if (g.type === "Polygon") return g.coordinates?.[0]?.[0] || null;
    if (g.type === "MultiPolygon") return g.coordinates?.[0]?.[0]?.[0] || null;
    return null;
  } catch {
    return null;
  }
}

function shouldSwapLatLon(feature) {
  const c = getFirstCoord(feature);
  if (!c) return false;

  const x = c[0]; // debería ser lon
  const y = c[1]; // debería ser lat
  if (typeof x !== "number" || typeof y !== "number") return false;

  // Caso global claro: lon fuera de rango
  if (Math.abs(x) > 90) return true;

  // Heurística muy segura para España/Europa:
  // si "lon" parece una latitud (30..60) y "lat" parece una longitud (-20..20)
  if (Math.abs(x) > 25 && Math.abs(y) < 25) return true;

  return false;
}

function swapCoordsInPlace(feature) {
  const g = feature.geometry;
  if (g.type === "Polygon") {
    g.coordinates = g.coordinates.map(ring => ring.map(([a,b]) => [b,a]));
  } else if (g.type === "MultiPolygon") {
    g.coordinates = g.coordinates.map(poly =>
      poly.map(ring => ring.map(([a,b]) => [b,a]))
    );
  }
}


  function proximityBand(m) {
  if (m == null || !isFinite(m)) {
    return {
      label: "No disponible",
      color: "#64748b",
      dots: ""
    };
  }

  if (m <= 500) {
    return {
      label: "Muy alto",
      color: "#dc2626",
      dots: "●"
    };
  }

  if (m <= 2000) {
    return {
      label: "Alto",
      color: "#f97316",
      dots: "●"
    };
  }

  if (m <= 5000) {
    return {
      label: "Medio",
      color: "#eab308",
      dots: "●"
    };
  }

  if (m <= 10000) {
    return {
      label: "Bajo",
      color: "#064e3b",
      dots: "●"
    };
  }

  return {
    label: "Muy bajo",
    color: "#064e3b",
    dots: "●●"
  };
}


  function bboxExpandDegrees(bbox, meters, latRef) {
    const mPerDegLat = 111320;
    const dLat = meters / mPerDegLat;
    const dLng = meters / (mPerDegLat * Math.cos((latRef * Math.PI) / 180) || 1);
    return [bbox[0] - dLng, bbox[1] - dLat, bbox[2] + dLng, bbox[3] + dLat];
  }

  function flattenLineCoords(line) {
    if (!line || !line.geometry) return [];
    const g = line.geometry;
    if (g.type === "LineString") return g.coordinates || [];
    if (g.type === "MultiLineString") {
      const out = [];
      (g.coordinates || []).forEach((ls) => (ls || []).forEach((c) => out.push(c)));
      return out;
    }
    return [];
  }

  function bboxExpandDegrees(bbox, meters, latRef) {
    const mPerDegLat = 111320;
    const dLat = meters / mPerDegLat;
    const dLng = meters / (mPerDegLat * Math.cos((latRef * Math.PI) / 180) || 1);
    return [bbox[0] - dLng, bbox[1] - dLat, bbox[2] + dLng, bbox[3] + dLat];
  }

  function flattenLineCoords(line) {
    if (!line || !line.geometry) return [];
    const g = line.geometry;
    if (g.type === "LineString") return g.coordinates || [];
    if (g.type === "MultiLineString") {
      const out = [];
      (g.coordinates || []).forEach((ls) => (ls || []).forEach((c) => out.push(c)));
      return out;
    }
    return [];
  }

  function polygonToLineFeature(poly) {
  try {
    const line = turf.polygonToLine(poly);

    // Caso normal: Feature(LineString / MultiLineString)
    if (line?.type === "Feature") return line;

    // Caso FeatureCollection: unir todo en una MultiLineString
    if (line?.type === "FeatureCollection") {
      const parts = [];

      for (const f of line.features || []) {
        const g = f?.geometry;
        if (!g) continue;

        if (g.type === "LineString") parts.push(g.coordinates);
        else if (g.type === "MultiLineString") {
          for (const ls of g.coordinates || []) parts.push(ls);
        }
      }

      if (!parts.length) return null;
      return turf.multiLineString(parts);
    }

    return null;
  } catch {
    return null;
  }
}


  function sampleCoords(coords, maxN) {
    const n = coords.length;
    if (!n) return [];
    if (n <= maxN) return coords;
    const step = Math.ceil(n / maxN);
    const out = [];
    for (let i = 0; i < n; i += step) out.push(coords[i]);
    return out;
  }

  function pointToLineDistMeters(ptCoord, line) {
    const pt = turf.point(ptCoord);
    const km = turf.pointToLineDistance(pt, line, { units: "kilometers" });
    return km * 1000;
  }

  function polygonDistanceMeters(polyA, polyB, maxSamplePoints) {
  if (!polyA?.geometry || !polyB?.geometry) return Infinity;

  const tA = polyA.geometry.type;
  const tB = polyB.geometry.type;
  if (!["Polygon", "MultiPolygon"].includes(tA)) return Infinity;
  if (!["Polygon", "MultiPolygon"].includes(tB)) return Infinity;

  // Si intersectan → distancia 0
  try {
    if (turf.booleanIntersects(polyA, polyB)) return 0;
  } catch {
    // no abortamos
  }

  // Convertimos polígonos a líneas válidas para Turf
  const lineA = polygonToLineFeature(polyA);
  const lineB = polygonToLineFeature(polyB);
  if (!lineA?.geometry || !lineB?.geometry) return Infinity;

  // Muestreamos puntos del borde
  const coordsA = sampleCoords(flattenLineCoords(lineA), maxSamplePoints);
  const coordsB = sampleCoords(flattenLineCoords(lineB), maxSamplePoints);
  if (!coordsA.length || !coordsB.length) return Infinity;

  let best = Infinity;

  // A → línea B
  for (const c of coordsA) {
    try {
      const d = pointToLineDistMeters(c, lineB);
      if (d < best) best = d;
      if (best <= 1) return best;
    } catch {}
  }

  // B → línea A
  for (const c of coordsB) {
    try {
      const d = pointToLineDistMeters(c, lineA);
      if (d < best) best = d;
      if (best <= 1) return best;
    } catch {}
  }

  return best;
}



  function buildIndex(features) {
    const tree = new RBush();

    const items = [];

    for (let i = 0; i < features.length; i++) {
      const f = features[i];
      if (!f || !f.geometry) continue;

      let bb;
      try {
        bb = turf.bbox(f);
      } catch (e) {
        continue;
      }

      items.push({
        minX: bb[0],
        minY: bb[1],
        maxX: bb[2],
        maxY: bb[3],
        __i: i,
      });
    }

    tree.load(items);
    return tree;
  }

  function queryCandidates(parcelFeature) {
    const bb = turf.bbox(parcelFeature);
    const center = turf.center(parcelFeature).geometry.coordinates; // [lon,lat]
    const expanded = bboxExpandDegrees(bb, CFG.maxSearchMeters, center[1]);

    const hits = STATE.index.search({
      minX: expanded[0],
      minY: expanded[1],
      maxX: expanded[2],
      maxY: expanded[3],
    });

    return hits.map((h) => STATE.features[h.__i]).filter(Boolean);
  }

  async function ensureReady() {
    if (STATE.ready) return;
    if (STATE.loading) {
      // espera activa simple (evita duplicar descargas)
      while (STATE.loading) await new Promise(r => setTimeout(r, 50));
      return;
    }

    STATE.loading = true;

    // Comprobaciones rápidas
    if (!window.turf) throw new Error("IPU: Turf no está cargado (window.turf)");
    const RBush = window.RBush || window.rbush;
    if (!RBush) throw new Error("IPU: RBush no está cargado");

    console.log("[IPU] fetch URL =", CFG.url);
    const res = await fetch(CFG.url, { cache: "force-cache" });
    if (!res.ok) throw new Error("IPU: No se pudo cargar suelo artificial: " + res.status);

    const gj = await res.json();
    const feats = (gj && gj.features) ? gj.features : [];

    STATE.features = feats;
    STATE.index = buildIndex(feats);

    STATE.ready = true;
    STATE.loading = false;

    console.log("[IPU] listo. Features suelo artificial:", feats.length);
  }

  async function computeIPU(parcelFeature) {
    parcelFeature.properties = parcelFeature.properties || {};
    // Normaliza lon/lat una sola vez por parcela (evita falsos >8km)
if (!parcelFeature.properties.__ipu_lonlat_checked) {
  parcelFeature.properties.__ipu_lonlat_checked = true;
  if (parcelFeature?.geometry?.type === "Polygon" || parcelFeature?.geometry?.type === "MultiPolygon") {
    if (shouldSwapLatLon(parcelFeature)) {
      swapCoordsInPlace(parcelFeature);
      parcelFeature.properties.__ipu_lonlat_swapped = true;
      console.log("[IPU] coords swapped for", parcelFeature.id || parcelFeature.properties?.id || "parcel");
    }
  }
}


    // Cache por parcela (activado)
if (parcelFeature.properties.__ipu && parcelFeature.properties.__ipu.meters != null) {
  return parcelFeature.properties.__ipu;
}



    // Lazy load aquí (solo cuando se necesita)
    await ensureReady();

    let best = Infinity;
    const cands = queryCandidates(parcelFeature);

    // Si no hay candidatos, seguimos y el best quedará en Infinity
// El fallback se gestiona al final de computeIPU


    for (const u of cands) {
      const d = polygonDistanceMeters(parcelFeature, u, CFG.maxSamplePoints);
      if (d < best) best = d;
      if (best <= 1) break;
    }

    // ===== FINAL DEFINITIVO computeIPU =====
let meters = best;

// Si no se ha encontrado suelo artificial dentro del radio
if (!isFinite(meters)) {
  meters = CFG.maxSearchMeters;
}

const band = proximityBand(meters);

const out = {
  meters,
  band
};

parcelFeature.properties.__ipu = out;
return out;

  }

  // API pública
  window.ArcadiaIPU = { computeIPU };
})();
