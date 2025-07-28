import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
SCHEMA_DIR = os.path.join(os.path.dirname(__file__), "supabase_schema")

def run_sql_file(cur, path):
    with open(path, "r") as f:
        sql = f.read()
        cur.execute(sql)

def create_tables():
    if not DATABASE_URL:
        print("DATABASE_URL not set in environment.")
        return
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        # Sort files to ensure enums are created before tables that use them
        files = sorted(os.listdir(SCHEMA_DIR))
        for fname in files:
            if fname.endswith(".sql"):
                print(f"Running {fname}...")
                run_sql_file(cur, os.path.join(SCHEMA_DIR, fname))
        conn.commit()
        cur.close()
        conn.close()
        print("All SQL files executed successfully in Supabase!")
    except Exception as e:
        print(f"Error creating tables: {e}")

if __name__ == "__main__":
    create_tables() 