# Santander Finance Hub - Dashboard

Un panel de control web interactivo, moderno y con un diseño oscuro premium (glassmorphism) para analizar, filtrar y clasificar dinámicamente tus transacciones bancarias del Banco Santander.

## Características

*   **Indicadores Financieros Clave (KPIs)**: Saldo actual, ingresos totales, gastos totales y tasa de ahorro con barra de progreso de color adaptativo.
*   **Gráficos Interactivos (Chart.js)**:
    *   Evolución histórica del saldo.
    *   Ingresos vs. Gastos agrupados por mes.
    *   Dona de desglose de gastos por categoría.
*   **Gestor de Reglas en Tiempo Real**: Añade categorías y define reglas de coincidencia (`contains`, `starts_with`, `equals`) para clasificar tus movimientos al instante.
*   **Persistencia de Categorías**:
    *   Las reglas se aplican en el cliente y se guardan temporalmente en `localStorage`.
    *   Botón para exportar y guardar permanentemente las reglas actualizadas en el archivo `config.json` del servidor.
*   **Tabla de Transacciones**: Buscador de texto, filtros por categoría, mes y tipo (ingreso/gasto), y reasignación manual de categorías directamente desde la fila.

## Requisitos

*   Python 3.x
*   Dependencias: `flask`, `pandas`, `openpyxl`

## Instalación y Uso

1.  Instala las dependencias necesarias:
    ```bash
    pip install flask pandas openpyxl
    ```

2.  Crea tu archivo de reglas `config.json`. Puedes copiar la plantilla base:
    ```bash
    cp config.json.example config.json
    ```

3.  Coloca tu archivo de movimientos bancarios del Santander (en formato Excel `.xlsx`) en la ruta esperada por la aplicación o edita la ruta `EXCEL_PATH` en `app.py`.

4.  Ejecuta el servidor web local:
    ```bash
    python3 app.py
    ```

5.  La aplicación abrirá automáticamente una pestaña en tu navegador web en `http://127.0.0.1:5000`.
