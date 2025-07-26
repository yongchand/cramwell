import requests
import time
import pandas as pd
import os
from typing import Optional, Dict, Any, List
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
load_dotenv(override=True)
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

class OtelTracesSupabaseEngine:
    def __init__(self, table_name: str = "otel_traces", service_name: str = "service"):
        self.service_name = service_name
        self.table_name = table_name

    def _export(self, start_time: Optional[int] = None, end_time: Optional[int] = None, limit: Optional[int] = None) -> Dict[str, Any]:
        url = "http://localhost:16686/api/traces"
        params: Dict[str, Any] = {
            "service": self.service_name,
            "start": start_time or int(time.time() * 1000000) - (24 * 60 * 60 * 1000000),
            "end": end_time or int(time.time() * 1000000),
            "limit": limit or 1000,
        }
        response = requests.get(url, params=params)
        print(response.json())
        return response.json()

    def _to_pandas(self, data: Dict[str, Any]) -> pd.DataFrame:
        rows: List[Dict[str, Any]] = []
        for trace in data.get("data", []):
            trace_id = trace.get("traceID")
            service_map = {pid: proc.get("serviceName") for pid, proc in trace.get("processes", {}).items()}
            for span in trace.get("spans", []):
                span_id = span.get("spanID")
                operation = span.get("operationName")
                start = span.get("startTime")
                duration = span.get("duration")
                process_id = span.get("processID")
                service = service_map.get(process_id, "")
                status = next((tag.get("value") for tag in span.get("tags", []) if tag.get("key") == "otel.status_code"), "")
                parent_span_id = None
                if span.get("references"):
                    parent_span_id = span["references"][0].get("spanID")
                rows.append({
                        "trace_id": trace_id,
                        "span_id": span_id,
                        "parent_span_id": parent_span_id,
                        "operation_name": operation,
                        "start_time": start,
                        "duration": duration,
                        "status_code": status,
                        "service_name": service,
                })
        return pd.DataFrame(rows)

    def insert_traces(self, dataframe: pd.DataFrame):
        records = dataframe.to_dict(orient="records")
        for record in records:
            supabase.table(self.table_name).insert(record).execute()

    def export_and_insert(self, start_time: Optional[int] = None, end_time: Optional[int] = None, limit: Optional[int] = None):
        data = self._export(start_time=start_time, end_time=end_time, limit=limit)
        df = self._to_pandas(data)
        self.insert_traces(df)

    def fetch_traces(self, filters: Optional[Dict[str, Any]] = None) -> pd.DataFrame:
        query = supabase.table(self.table_name).select("*")
        if filters:
            for key, value in filters.items():
                query = query.eq(key, value)
        response = query.execute()
        return pd.DataFrame(response.data)
