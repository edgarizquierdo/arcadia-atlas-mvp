import json
from pathlib import Path
from jinja2 import Environment, FileSystemLoader, select_autoescape

# --- Rutas base ---
BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
MOCK_DIR = BASE_DIR / "mock"

# --- Jinja environment ---
env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=select_autoescape(["html"])
)

# --- Cargar template principal ---
template = env.get_template("report_base.html")

# --- Cargar datos mock ---
with open(MOCK_DIR / "report_mock.json", encoding="utf-8") as f:
    data = json.load(f)

# --- Renderizar HTML ---
html = template.render(**data)

# --- Guardar salida ---
output_path = BASE_DIR / "output.html"
with open(output_path, "w", encoding="utf-8") as f:
    f.write(html)

print("✅ HTML generado correctamente:")
print(output_path)
