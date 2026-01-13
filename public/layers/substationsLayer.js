// public/layers/substationsLayer.js
(function () {
  console.log("✅ substationsLayer.js cargado");

  const URL_SUBEST =
    "https://gist.githubusercontent.com/edgarizquierdo/c3c9570b4ed800c36a5071412f3cf3d2/raw/1be9c6cc9640bd1a3c599f473234568ffb6a4402/subestaciones_iberia.geojson";

  const ICON_URL = "icons/substation.png";

  // 👉 FUNCIÓN AÑADIDA (solo esto es nuevo)
  function getTension(props = {}) {
    const keys = [
      "tension",
      "TENSION",
      "TENSIO",
      "tensio",
      "KV",
      "kV",
      "kv",
      "voltage",
      "VOLTAGE"
    ];

    for (const k of keys) {
      const v = props[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        const n = Number(String(v).replace(",", "."));
        return Number.isNaN(n) ? v : `${n} kV`;
      }
    }
    return "Desconocida";
  }

  window.initSubstationsLayer = function (map) {
    if (!map) throw new Error("initSubstationsLayer: map es obligatorio");

    let enabled = false;
    let layer = null;
    let loading = false;
    let btn = null;

    async function ensureLoaded() {
      if (layer || loading) return;
      loading = true;

      try {
        const res = await fetch(URL_SUBEST);
        const data = await res.json();

        layer = L.geoJSON(data, {
          pane: 'powerPane',        // 👈 ESTA LÍNEA
          pointToLayer: (f, latlng) => {
            return L.marker(latlng, {
              icon: L.divIcon({
                className: "",
                html: `
                  <div style="
                    width:34px;
                    height:34px;
                    background:#dc2626;
                    border-radius:50%;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    border:2px solid #7f1d1d;
                  ">
                    <img src="${ICON_URL}" style="width:18px;height:18px;">
                  </div>
                `,
                iconSize: [34, 34],
                iconAnchor: [17, 17],
                popupAnchor: [0, -16]
              })
            }).bindPopup(`
              <b>Subestación eléctrica</b><br>
              Tensión: ${getTension(f.properties)}
            `);
          }
        });
      } finally {
        loading = false;
      }
    }

    async function setEnabled(next) {
      enabled = !!next;

      if (enabled) {
        await ensureLoaded();
        if (!map.hasLayer(layer)) layer.addTo(map);

        btn.classList.add("active");
        btn.style.background = "#16a34a";
        btn.style.border = "1px solid #22c55e";
      } else {
        if (layer && map.hasLayer(layer)) map.removeLayer(layer);

        btn.classList.remove("active");
        btn.style.background = "rgba(2,6,23,0.72)";
        btn.style.border = "1px solid rgba(33,48,77,0.9)";
      }
    }

    const SubstationsControl = L.Control.extend({
      options: { position: "topright" },
      onAdd: function () {
        const container = L.DomUtil.create("div", "leaflet-control");

        btn = L.DomUtil.create("button", "arcadia-layer-btn", container);
        btn.type = "button";
        btn.title = "Subestaciones";

        // ESTILO (idéntico al ⚡)
        btn.style.width = "44px";
        btn.style.height = "44px";
        btn.style.borderRadius = "14px";
        btn.style.border = "1px solid rgba(33,48,77,0.9)";
        btn.style.background = "rgba(2,6,23,0.72)";
        btn.style.cursor = "pointer";
        btn.style.display = "flex";
        btn.style.alignItems = "center";
        btn.style.justifyContent = "center";
        btn.style.backdropFilter = "blur(6px)";
        btn.style.boxShadow = "0 2px 10px rgba(0,0,0,0.25)";

        btn.innerHTML = `<img src="${ICON_URL}" style="width:22px;height:22px;">`;

        btn.addEventListener("mouseenter", () => {
          if (!enabled) btn.style.background = "rgba(2,6,23,0.9)";
        });

        btn.addEventListener("mouseleave", () => {
          if (!enabled) btn.style.background = "rgba(2,6,23,0.72)";
        });

        btn.addEventListener("click", () => setEnabled(!enabled));

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        return container;
      }
    });

    map.addControl(new SubstationsControl());
  };
})();
