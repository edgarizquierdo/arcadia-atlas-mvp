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

      // UI
      if (btn) btn.classList.toggle("is-active", enabled);
      if (wrap) wrap.classList.toggle("is-active", enabled);
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

  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  return await res.json();
}

        async function searchAndZoom() {
  const raw = (input.value || "").trim();
  if (!raw) return;

  // 1️⃣ Extraer núcleo del nombre (primeros 2–3 términos)
  const core = raw.split(" ").slice(0, 3).join(" ");

  const params = new URLSearchParams({
    format: "json",
    limit: "1",
    countrycodes: "es",
    q: core,
    viewbox: "0.15,42.9,3.4,40.4", // bounding box Cataluña
    bounded: "1"
  });

  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const data = await res.json();

  if (!data || !data.length) {
    alert("Municipio no encontrado en Cataluña.");
    return;
  }

  const lat = parseFloat(data[0].lat);
  const lon = parseFloat(data[0].lon);

  // Activa automáticamente la capa ⚡
  if (!enabled) await setEnabled(true);

  map.setView([lat, lon], 12);
}

        go.addEventListener("click", searchAndZoom);
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            searchAndZoom();
          }
        });

        return div;
      }
    });

    map.addControl(new SearchControl());

    // Tip: Leaflet apila controles en el orden de añadido.
    // En tu index ya añades medición primero, así que:
    // Medición (📏📐🗑) -> ⚡ -> buscador.
  };
})();
