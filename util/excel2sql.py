import pandas as pd
import sqlite3
from contrib import ConfigParser

cfg = ConfigParser('../config.toml').tomlParser()

class TransformWorkbook:
    
    def __init__(self):

        self.workbook_path  = cfg['data']['xl_path']

    def getListOfSheets(self):

        workbook = self.workbook_path
        xl       = pd.ExcelFile(workbook)

        return xl.sheet_names

    def getList(self, sheet_name):

        document = pd.read_excel(
            self.workbook_path,
            sheet_name=sheet_name,
            header=0
        )

        return document

class Database:

    def __init__(self):

        self.db_conn = sqlite3.connect(cfg['data']['db_path'])

    def createTable(self, table_name):

        c = self.db_conn

        try:
            c.execute(
                f"""
                CREATE TABLE {table_name} (
                    Title TEXT,
                    Platform TEXT,
                )
                """
            )
        except sqlite3.OperationalError:
            print(f'Could not create table "{table_name}, perhaps it already exists?')

        wb = TransformWorkbook.getList(sheet_name=table_name)

        wb.to_sql(table_name, c, if_exists='append', index=False)


db = Database()
wb = TransformWorkbook()

for table in wb.getListOfSheets():
    db.createTable(table)