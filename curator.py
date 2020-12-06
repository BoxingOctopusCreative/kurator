import pandas as pd
import sqlite3



def getListOfSheets(workbook_path):
    xl = pd.ExcelFile(workbook_path)

    return xl.sheet_names

def getListBySystem(system_name):
    document = pd.read_excel(
        'collection.xlsx',
        sheet_name=system_name,
        header=0
    )

    return document

print(getListOfSheets('collection.xlsx'))

for system in getListOfSheets('collection.xlsx'):
    print(getListBySystem(system))