# Cramwell🦙

## A fluffy and open-source alternative to NotebookLM!

https://github.com/user-attachments/assets/7e9cca45-8a4c-4dfa-98d2-2cef147422f2

<p align="center">
  A fully open-source alternative to NotebookLM, backed by <a href="https://cloud.llamaindex.ai?utm_source=demo&utm_medium=notebookLM"><strong>LlamaCloud</strong></a>.
</p>

<p align="center">
    <a href="https://github.com/run-llama/notebookllama/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/run-llama/notebookllama?color=blue"></a>
    <a href="https://github.com/run-llama/notebookllama/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/run-llama/notebookllama?color=yellow"></a>
    <a href="https://github.com/run-llama/notebookllama/issues"><img alt="Issues" src="https://img.shields.io/github/issues/run-llama/notebookllama?color=orange"></a>
</p>

---

### Prerequisites

This project uses `uv` to manage dependencies. Before you begin, make sure you have `uv` installed.

On macOS and Linux:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

On Windows:

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

For more install options, see `uv`'s [official documentation](https://docs.astral.sh/uv/getting-started/installation/).

---

### Get it up and running!

**1. Clone the Repository**

```bash
git clone https://github.com/run-llama/notebookllama
cd notebookllama/
```

**2. Install Python Dependencies**

```bash
uv sync
```

**3. Configure Environment Variables**

First, create your `.env` file by copying the example:

```bash
cp .env.example .env
```

Next, open the `.env` file and add your API keys:

- `OPENAI_API_KEY`: [Get it here](https://platform.openai.com/api-keys)
- `LLAMACLOUD_API_KEY`: [Get it here](https://cloud.llamaindex.ai?utm_source=demo&utm_medium=notebookLM)
- `DATABASE_URL`: Your Postgres connection string (for Supabase or local Postgres)

**4. Set Up the Database Schema (Supabase/Postgres)**

Run the following script to create all necessary tables in your database:

```bash
uv run tools/create_supabase_tables.py
```

This will execute all SQL files in `tools/supabase_schema/` against the database specified by `DATABASE_URL`.

**5. Start Required Services (Postgres, Jaeger, etc.)**

If you use Docker, you can start the required containers with:

```bash
docker compose up -d
```

**6. Run Backend Services**

You need to run two backend servers:

- **MCP Server** (for document processing and orchestration):

  ```bash
  uv run src/cramwell/server.py
  ```

- **API Server** (FastAPI, serves the REST API):

  ```bash
  uv run src/cramwell/api_server.py
  ```

  The API server will be available at `http://localhost:8000` by default.

**7. Run the Frontend**

The frontend is a Next.js app located in the `frontend/` directory. For more details, see [`frontend/README.md`](frontend/README.md).

Basic steps:

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at `http://localhost:3000`.

---

### Contributing

Contribute to this project following the [guidelines](./CONTRIBUTING.md) (if available).

### License

This project is provided under an [MIT License](./LICENSE).
