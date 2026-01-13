// layers/powerRiskLayer.js
// Capa encapsulada: líneas AT + zona riesgo bosque + buscador municipio
// No toca tu app: solo necesita `map` y crea sus propios controles/capas.

(function () {
  // URLs (las del pasted.txt)
  const URL_LINEAS = "https://gist.githubusercontent.com/edgarizquierdo/2426bc0288a1adc5b5f8e9758bc59d1c/raw/c6397841e989c68e21669a2ae3f871ccc18ff94c/lineas_iberia.geojson";
  const URL_RIESGO = "https://raw.githubusercontent.com/edgarizquierdo/riesgo_alto_iberia/main/riesgo_alto_iberia.geojson.geojson";

  // Export global mínimo (1 función)
  window.initPowerRiskLayer = function initPowerRiskLayer(map) {
    if (!map) throw new Error("initPowerRiskLayer(map): map es requerido");

    // --- Estado interno (no global) ---
    let enabled = false;
    let loaded = false;

    const group = L.layerGroup();           // contenedor ON/OFF
    let layerLineas = null;
    let layerRiesgo = null;

    // --- Estilos ---
    function styleLineas(f) {
      const p = f && f.properties ? f.properties : {};
      const v = Number(p.voltage ?? p.v_nom ?? 0);
      if (v >= 380) return { color: "orange", weight: 2 };
      if (v >= 220) return { color: "green", weight: 1.5 };
      return { color: "gray", weight: 1 };
    }

    function styleRiesgo() {
      return { color: "red", weight: 0, fillColor: "red", fillOpacity: 0.25 };
    }

    // --- Carga (solo 1 vez) ---
    async function loadLayersOnce() {
      if (loaded) return;
      loaded = true;

      // líneas AT
      const resL = await fetch(URL_LINEAS);
      const gjL = await resL.json();
      layerLineas = L.geoJSON(gjL, { style: styleLineas });

      // riesgo (buffer con turf) — requiere que turf exista (en tu index ya lo tienes)
      const resR = await fetch(URL_RIESGO);
      const gjR = await resR.json();

      // buffer suave (igual que tu demo): 0.15 km
      const buff = turf.buffer(gjR, 0.15, { units: "kilometers" });
      layerRiesgo = L.geoJSON(buff, { style: styleRiesgo });

      // Añadimos al grupo
      layerLineas.addTo(group);
      layerRiesgo.addTo(group);
    }

    // --- Toggle ---
    async function setEnabled(on) {
  enabled = !!on;

  if (enabled) {
    await loadLayersOnce();
    if (!map.hasLayer(group)) group.addTo(map);
  } else {
    if (map.hasLayer(group)) map.removeLayer(group);
  }

  // ⬇️ AQUÍ VA EL BLOQUE NUEVO ⬇️
  if (btn) {
    if (enabled) {
      btn.classList.add("is-active");
      btn.style.setProperty("background", "#16a34a", "important");
      btn.style.setProperty("border", "1px solid #22c55e", "important");
    } else {
      btn.classList.remove("is-active");
      btn.style.setProperty("background", "rgba(2,6,23,0.72)", "important");
      btn.style.setProperty("border", "1px solid rgba(33,48,77,0.9)", "important");
    }
  }

  if (wrap) {
    wrap.classList.toggle("is-active", enabled);
  }
}

    // --- Control: botón ⚡ debajo de medición (topright) ---
    let btn = null;
    let wrap = null;

    const BoltControl = L.Control.extend({
      options: { position: "topright" },
      onAdd: function () {
        const div = L.DomUtil.create("div", "leaflet-control bolt-control");

        // Caja estilo similar a tu measure-tools
        div.innerHTML = `
          <div class="box" style="
            display:flex;
            flex-direction:column;
            gap:6px;
            padding:6px;
            background: rgba(2,6,23,0.72);
            border: 1px solid var(--line, #21304d);
            border-radius: 12px;
            backdrop-filter: blur(6px);
          ">
            <button type="button" title="Líneas AT + Riesgo bosque" aria-label="Líneas AT + Riesgo bosque"
              style="
                width: 38px;
                height: 38px;
                border-radius: 12px;
                border: 1px solid #2a3b5f;
                background: #0e1626;
                color: #e2e8f0;
                cursor: pointer;
                display:inline-flex;
                align-items:center;
                justify-content:center;
                font-size: 18px;
                line-height: 1;
              "
              data-bolt="1"
            >⚡</button>
          </div>
        `;

        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);

        wrap = div;
        btn = div.querySelector('button[data-bolt="1"]');

        btn.addEventListener("click", () => setEnabled(!enabled));

        // estado inicial (OFF)
        return div;
      }
    });

    map.addControl(new BoltControl());

    // --- Control: buscador municipio (topright) debajo del ⚡ ---
    // (si prefieres ocultarlo hasta activar ⚡, lo hago también; de momento siempre visible)
    const SearchControl = L.Control.extend({
      options: { position: "topright" },
      onAdd: function () {
        const div = L.DomUtil.create("div", "leaflet-control muni-search");

        div.innerHTML = `
          <div style="
            display:flex;
            gap:6px;
            padding:6px;
            background: rgba(2,6,23,0.72);
            border: 1px solid var(--line, #21304d);
            border-radius: 12px;
            backdrop-filter: blur(6px);
            align-items:center;
          ">
            <input type="text" placeholder="Buscar municipio…" data-muni="q"
              style="
                width: 180px;
                padding: 8px 10px;
                border-radius: 10px;
                border: 1px solid #2a3b5f;
                background:#0e1626;
                color:#e2e8f0;
                font-size: 13px;
                outline: none;
              "
            />
            <button type="button" data-muni="go" title="Ir"
              style="
                width:auto;
                padding: 8px 10px;
                border-radius:10px;
                border:1px solid #2a3b5f;
                background:#16a34a;
                color:#0b1120;
                font-weight:700;
                cursor:pointer;
              "
            >Ir</button>
          </div>
        `;

        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);

        const input = div.querySelector('input[data-muni="q"]');
        const go = div.querySelector('button[data-muni="go"]');

        // Contenedor de sugerencias
const suggestBox = document.createElement("div");
suggestBox.style.position = "absolute";
suggestBox.style.top = "100%";
suggestBox.style.left = "0";
suggestBox.style.right = "0";
suggestBox.style.background = "#020617";
suggestBox.style.border = "1px solid #21304d";
suggestBox.style.borderRadius = "10px";
suggestBox.style.marginTop = "4px";
suggestBox.style.maxHeight = "220px";
suggestBox.style.overflowY = "auto";
suggestBox.style.display = "none";
suggestBox.style.zIndex = "10000";
suggestBox.style.pointerEvents = "auto";
suggestBox.style.color = "#e2e8f0";
suggestBox.style.fontFamily = "Arial, sans-serif";

div.style.position = "relative";
div.style.overflow = "visible";
div.appendChild(suggestBox);


        // ================================
// PREDICTIVO: LISTENER INPUT
// ================================
input.addEventListener("input", () => {
  const value = input.value.trim();

  if (suggestTimer) clearTimeout(suggestTimer);

  if (value.length < 3) {
    suggestBox.style.display = "none";
    return;
  }

  suggestTimer = setTimeout(async () => {
    const results = await fetchSuggestions(value);

    suggestBox.innerHTML = "";

    if (!results || !results.length) {
      suggestBox.style.display = "none";
      return;
    }

    results.forEach(r => {
      const item = document.createElement("div");
      item.textContent = r.display_name.split(",")[0];
      item.style.padding = "8px 10px";
      item.style.cursor = "pointer";
      item.style.fontSize = "13px";
      item.style.color = "#e2e8f0";

      item.addEventListener("mouseenter", () => {
        item.style.background = "#1e293b";
      });
      item.addEventListener("mouseleave", () => {
        item.style.background = "transparent";
      });

      item.addEventListener("click", async () => {
        input.value = r.display_name.split(",")[0];
        suggestBox.style.display = "none";

        if (!enabled) await setEnabled(true);
        map.setView([parseFloat(r.lat), parseFloat(r.lon)], 12);
      });

      suggestBox.appendChild(item);
    });

    suggestBox.style.display = "block";
  }, 300);
});

// ================================
// BOTÓN "IR"
// ================================
go.addEventListener("click", () => {
  suggestBox.style.display = "none";
  searchAndZoom();
});

// ================================
// ENTER EN INPUT
// ================================
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    suggestBox.style.display = "none";
    searchAndZoom();
  }
});


        function normalizeName(str) {
  return str
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quita tildes
    .replace(/\b(de|del|la|el|les|los|l')\b/g, "")   // quita artículos
    .replace(/\s+/g, " ")
    .trim();
}

async function nominatimSearch(q) {
  const params = new URLSearchParams({
    format: "json",
    limit: "1",
    countrycodes: "es",
    q
  });

  // 🔴 AÑADIR ESTAS DOS LÍNEAS
  params.set("polygon_geojson", "1");
  params.set("addressdetails", "1");

  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  return await res.json();
}

let suggestTimer = null;

async function fetchSuggestions(q) {
  const params = new URLSearchParams({
    format: "json",
    limit: "6",
    countrycodes: "es",
    viewbox: "0.15,42.9,3.4,40.4", // Cataluña
    bounded: "1",
    q
  });

  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  return await res.json();
}

        async function searchAndZoom() {
  const raw = (input.value || "").trim();
  if (!raw) return;

  // Cataluña bbox para acotar (minLon, maxLat, maxLon, minLat)
  const CATALUNYA_VIEWBOX = "0.15,42.9,3.4,40.4";

  // Genera variantes de consulta (de más específica a más “tolerante”)
  const tokens = raw.split(/\s+/).filter(Boolean);

  const first2 = tokens.slice(0, 2).join(" ");              // "Sant Fost"
  const first3 = tokens.slice(0, 3).join(" ");              // "Sant Fost de" (a veces demasiado genérico)
  const first4 = tokens.slice(0, 4).join(" ");              // "Sant Fost de Campcentelles"

  // Quitamos “de/del/la/el…” para una variante útil
  const simplified = raw
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(de|del|la|el|les|los|l')\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Lista de queries a probar
  const queries = [
    `${raw}, Catalunya, España`,
    `${first4}, Catalunya, España`,
    `${first2}, Catalunya, España`,
    `${simplified}, Catalunya, España`,
    // último recurso: solo el núcleo, pero acotado por bbox
    `${first2}`
  ].filter((v, i, a) => v && a.indexOf(v) === i);

  async function nominatim(q) {
    const params = new URLSearchParams({
      format: "json",
      limit: "10",                 // <-- importante: más de 1 resultado
      countrycodes: "es",
      addressdetails: "1",
      q
    });

    // Acotamos físicamente a Cataluña siempre (evita salirse)
    params.set("viewbox", CATALUNYA_VIEWBOX);
    params.set("bounded", "1");

    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    return await res.json();
  }

  function looksCatalunya(r) {
    const a = r.address || {};
    const dn = (r.display_name || "").toLowerCase();
    return (
      dn.includes("catalunya") ||
      dn.includes("catalonia") ||
      (a.state && String(a.state).toLowerCase().includes("catal"))
    );
  }

  function score(r) {
  const cls = (r.class || "").toLowerCase();
  const typ = (r.type || "").toLowerCase();
  let s = 0;

  if (cls === "boundary") s += 50;
  if (typ.includes("administrative")) s += 40;
  if (["city", "town", "village", "municipality"].includes(typ)) s += 30;
  if (looksCatalunya(r)) s += 40;

  const name = (r.display_name || "").toLowerCase();
  const core = first2.toLowerCase();
  if (core && name.includes(core)) s += 25;

  return s;
}

let best = null;

for (const q of queries) {
  const results = await nominatim(q);
  if (!results || !results.length) continue;

  results.sort((a, b) => score(b) - score(a));
  best = results[0];

  if (looksCatalunya(best) && ((best.class || "").toLowerCase() === "boundary")) break;
}

if (!best) {
  alert("Municipio no encontrado en Cataluña.");
  return;
}

// Activar capa ⚡ una sola vez
if (!enabled) await setEnabled(true);

      if (best.geojson) {
        const layer = L.geoJSON(best.geojson);
        map.fitBounds(layer.getBounds(), { padding: [20, 20] });
        layer.remove();
      } else {
        map.setView([+best.lat, +best.lon], 12);
      }
    }

    return div;
  }
});

map.addControl(new SearchControl());

// Tip: Leaflet apila controles en el orden de añadido.
// En tu index ya añades medición primero, así que:
// Medición (📏📐🗑) -> ⚡ -> buscador.
};
})();
