import os
import json
import webbrowser
import threading
import time
import pandas as pd
from flask import Flask, jsonify, request, render_template, send_from_directory

app = Flask(__name__, template_folder='templates', static_folder='static')

EXCEL_PATH = '/Users/dayher/Applications/TransactionExcelFile.xlsx'
RULES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config.json')

def clean_amount(val):
    if pd.isna(val):
        return 0.0
    val_str = str(val).strip()
    val_str = val_str.replace('€', '').replace(' ', '')
    # Spanish format: dot for thousands, comma for decimals
    # First remove dots, then replace comma with dot
    val_str = val_str.replace('.', '').replace(',', '.')
    try:
        return float(val_str)
    except ValueError:
        return 0.0

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/data')
def get_data():
    if not os.path.exists(EXCEL_PATH):
        return jsonify({
            'status': 'error',
            'message': f'No se encontró el archivo de transacciones en: {EXCEL_PATH}'
        }), 404

    try:
        # Load from row 7 (index 6 in python if 0-based, or skiprows=7)
        # Let's inspect the sheet name first or let pandas auto-detect
        df = pd.read_excel(EXCEL_PATH, skiprows=7)
        df = df.dropna(how='all')
        
        # Ensure we have the correct columns
        expected_cols = ['Fecha operación', 'Fecha valor', 'Concepto', 'Importe', 'Saldo', 'Divisa']
        # Map actual columns if they differ slightly
        df.columns = [col.strip() if isinstance(col, str) else f'Col_{i}' for i, col in enumerate(df.columns)]
        
        # Let's clean the data
        transactions = []
        for index, row in df.iterrows():
            concepto = str(row.get('Concepto', '')).strip()
            # If Concepto is empty or NaN, ignore or skip header leftovers
            if pd.isna(row.get('Concepto')) or concepto == '' or concepto.lower() == 'concepto':
                continue
                
            importe_raw = str(row.get('Importe', '0€'))
            saldo_raw = str(row.get('Saldo', '0€'))
            
            importe_num = clean_amount(row.get('Importe', 0))
            saldo_num = clean_amount(row.get('Saldo', 0))
            
            # Format dates properly
            fecha_op = row.get('Fecha operación')
            if isinstance(fecha_op, pd.Timestamp):
                fecha_op_str = fecha_op.strftime('%d/%m/%Y')
            else:
                fecha_op_str = str(fecha_op).strip()
                
            fecha_val = row.get('Fecha valor')
            if isinstance(fecha_val, pd.Timestamp):
                fecha_val_str = fecha_val.strftime('%d/%m/%Y')
            else:
                fecha_val_str = str(fecha_val).strip()

            transactions.append({
                'id': index,
                'fecha_operacion': fecha_op_str,
                'fecha_valor': fecha_val_str,
                'concepto': concepto,
                'importe': importe_num,
                'importe_raw': importe_raw,
                'saldo': saldo_num,
                'saldo_raw': saldo_raw,
                'divisa': str(row.get('Divisa', 'EUR')).strip()
            })
            
        # Reverse transactions if they are listed in reverse chronological order (latest first)
        # To show chronological evolution of balance in the line chart.
        # Usually Santander statements have the latest transactions at the top, so we reverse it.
        # Let's check by dates. If the first transaction date is newer than the last, we reverse.
        # We can also sort them by date for calculation in frontend, but serving them in chronological order is good.
        return jsonify({
            'status': 'success',
            'data': transactions
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Error al procesar el archivo Excel: {str(e)}'
        }), 500

@app.route('/api/rules', methods=['GET', 'POST'])
def handle_rules():
    if request.method == 'POST':
        try:
            rules_data = request.json
            with open(RULES_PATH, 'w', encoding='utf-8') as f:
                json.dump(rules_data, f, indent=2, ensure_ascii=False)
            return jsonify({
                'status': 'success',
                'message': 'Reglas guardadas correctamente en config.json.'
            })
        except Exception as e:
            return jsonify({
                'status': 'error',
                'message': f'Error al guardar las reglas: {str(e)}'
            }), 500
    else:
        # GET
        if os.path.exists(RULES_PATH):
            try:
                with open(RULES_PATH, 'r', encoding='utf-8') as f:
                    rules_data = json.load(f)
                return jsonify(rules_data)
            except Exception as e:
                return jsonify({
                    'status': 'error',
                    'message': f'Error al leer las reglas: {str(e)}'
                }), 500
        else:
            return jsonify({'categories': {}})

def open_browser():
    time.sleep(1.5)
    webbrowser.open('http://127.0.0.1:5000')

if __name__ == '__main__':
    # Start thread to open browser
    threading.Thread(target=open_browser, daemon=True).start()
    app.run(host='127.0.0.1', port=5000, debug=True)
