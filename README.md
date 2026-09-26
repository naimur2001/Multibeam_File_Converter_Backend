It covers everything: **what** we built, **why** we built it, **how** the pipeline works, the **challenges** we overcame, and **how to run it**.

---

```markdown
# 🌊 Backend Service: Multibeam Sonar Converter

A containerized **Node.js (Express)** API that orchestrates the conversion of proprietary Kongsberg multibeam sonar data (`.all`) into industry-standard 3D point clouds (`.las`).

This backend acts as the bridge between raw hydrographic survey data and modern GIS engineering tools, abstracting the complexity of the Linux-only **MB-System** toolchain behind a simple REST API.

---

## 📖 Table of Contents

1. [Overview](#overview)
2. [Architecture & Tech Stack](#architecture--tech-stack)
3. [The Conversion Pipeline](#the-conversion-pipeline)
4. [Key Engineering Decisions](#key-engineering-decisions)
5. [Installation & Setup](#installation--setup)
6. [API Reference](#api-reference)
7. [Challenges Overcome](#challenges-overcome)
8. [Project Structure](#project-structure)

---

## 🎯 Overview

Hydrographic survey vessels record raw sonar pings in a proprietary binary format (`.all`). Downstream analysis tools require the open **LAS** format. This backend service automates that transformation.

**Core Responsibilities:**
*   **Ingestion:** Securely accepts large binary file uploads.
*   **Orchestration:** Manages a background job queue to prevent HTTP timeouts.
*   **Conversion:** Executes a specialized Linux command-line pipeline (`MB-System` → `PDAL`).
*   **Lifecycle Management:** Automatically cleans up temporary files to prevent disk exhaustion.

---

## 🏗️ Architecture & Tech Stack

The backend is designed to be **stateless** and **containerized**, ensuring it runs identically on any machine with Docker.

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Runtime** | Node.js 20 | Executes business logic and API routing. |
| **Framework** | Express.js | Handles HTTP requests, middleware, and CORS. |
| **File Handling** | Multer | Streams multipart uploads directly to disk (memory-safe). |
| **Process Bridge** | `child_process` | Spawns Linux CLI tools (`mbinfo`, `pdal`) from Node.js. |
| **Conversion Engine** | MB-System | C++ toolkit for reading/processing raw sonar binary data. |
| **Point Cloud Writer** | PDAL | Converts extracted XYZ coordinates into binary LAS format. |
| **Containerization** | Docker | Packages Ubuntu, Node.js, and MB-System into a single image. |

---

## ⚙️ The Conversion Pipeline

This is the heart of the system. When a file is uploaded, it passes through a strict 4-step pipeline.

### Step 1: Validation (`mbinfo`)
```bash
mbinfo -I input.all
```
*   **Why:** Verifies the binary header is a valid Kongsberg format.
*   **Outcome:** If this fails, the job is rejected immediately with a user-friendly error.

### Step 2: Preprocessing (`mbkongsbergpreprocess`)
```bash
mbkongsbergpreprocess -I input.all
```
*   **Why:** Cleans raw navigation/attitude data and converts the proprietary binary into MB-System's internal working format (`.mb59`).

### Step 3: Extraction & Normalization (`mblist` + Node Streams)
```bash
mblist -I input.mb59 -MA -OXYZ
```
*   **Why:** Extracts millions of depth points.
*   **Crucial Logic:** MB-System outputs Depth as **positive-down**. LAS files expect **Elevation** (positive-up).
*   **Implementation:** We use Node.js streams to read the output line-by-line, invert the Z-axis (`elevation = -depth`), and write a clean CSV (`normalized.xyz`).

### Step 4: LAS Generation (`PDAL`)
```bash
pdal pipeline pipeline.json
```
*   **Why:** Packs the CSV coordinates into the binary LAS structure.
*   **Precision:** We configure PDAL with a scale factor of `0.0000001` to preserve WGS84 GPS precision, which would otherwise be lost with default integer scaling.

---

## 💡 Key Engineering Decisions

### 1. Asynchronous Job Queue
*   **Decision:** The upload endpoint returns `202 Accepted` immediately with a `jobId`.
*   **Why:** Converting a 50MB file can take minutes. Synchronous processing would cause HTTP timeouts and browser disconnects.
*   **Result:** The frontend polls for status (`queued` → `processing` → `completed`) without blocking the user.

### 2. Isolated Job Directories
*   **Decision:** Every upload gets a unique UUID folder: `/data/jobs/{uuid}/`.
*   **Why:** Prevents filename collisions (e.g., two users uploading `survey.all`) and prevents **Path Traversal attacks** by ignoring user-supplied filenames.

### 3. Automatic Cleanup Strategy
*   **Decision:** A background service (`cleanup.service.js`) runs every 5 minutes.
*   **Why:** Docker containers have limited disk space.
*   **Logic:** Any job folder older than 15 minutes is automatically deleted (`fs.rmSync`), ensuring the server never runs out of space.

### 4. Dockerized MB-System
*   **Decision:** MB-System is compiled from source inside the Docker image.
*   **Why:** MB-System is Linux-only and relies on complex C++ geospatial libraries (`libgdal-dev`, `libproj-dev`). Docker guarantees these dependencies exist regardless of the evaluator's OS (Windows/Mac).

---

## 🚀 Installation & Setup

### Prerequisites
*   Docker Desktop installed and running.

### 1. Build the Image
This step compiles MB-System from source. It may take 10-15 minutes.
```bash
cd backend
docker build --progress=plain -t multibeam-backend .
```

### 2. Run the Container
```bash
docker run --rm -d \
  --name multibeam-backend \
  -p 4000:4000 \
  -v multibeam-jobs:/data/jobs \
  multibeam-backend
```

### 3. Verify
```bash
curl http://localhost:4000/api/v1/health
```

---

## 📡 API Reference

### Upload File
Creates a new conversion job.
```http
POST /api/v1/jobs
Content-Type: multipart/form-data
Field: file
```
**Response:** `202 Accepted`
```json
{
  "jobId": "8f1c2c9e-...",
  "status": "queued",
  "message": "File received and queued for processing"
}
```

### Check Status
Poll this endpoint to track progress.
```http
GET /api/v1/jobs/:jobId
```
**Response:** `200 OK`
```json
{
  "status": "completed",
  "stage": "completed",
  "summary": { "pointCount": 145000, "minDepth": 12.5, "maxDepth": 85.2 }
}
```

### Download Result
```http
GET /api/v1/jobs/:jobId/download
```
Returns the binary `.las` file.

---

## 🛡️ Challenges Overcome

### 1. The CMake GUI Dependency Trap
*   **Issue:** The initial Docker build failed because MB-System tried to compile graphical tools requiring X11/Motif libraries, which are unnecessary for a headless server.
*   **Solution:** Discovered and applied the `-DbuildGUIs=OFF` CMake flag, resulting in a successful, lightweight headless build.

### 2. Memory Exhaustion on Large Files
*   **Issue:** Using Node's `child_process.exec` to run `mblist` caused "Out of Memory" crashes because it buffered millions of lines of text into RAM.
*   **Solution:** Switched to `child_process.spawn` with Node.js streams, processing the data line-by-line and keeping RAM usage near zero.

### 3. Coordinate Precision Loss
*   **Issue:** Default LAS writers rounded WGS84 coordinates (e.g., `12.3456`), destroying survey accuracy.
*   **Solution:** Configured PDAL with explicit scale factors (`0.0000001`) to preserve sub-meter GPS precision.

---

## 📂 Project Structure

```text
backend/
├── src/
│   ├── config/
│   │   └── env.js              # Environment variables & paths
│   ├── controllers/
│   │   └── jobs.controller.js  # HTTP request handlers
│   ├── middlewares/
│   │   ├── error.middleware.js # Global error handling & cleanup
│   │   └── upload.middleware.js# Multer config & job folder creation
│   ├── routes/
│   │   └── jobs.routes.js      # API endpoint definitions
│   ├── services/
│   │   ├── cleanup.service.js  # Auto-deletes old job folders
│   │   ├── converter.service.js# MB-System pipeline orchestration
│   │   ├── job.service.js      # In-memory job state management
│   │   └── process.service.js  # Safe child_process wrapper
│   ├── utils/
│   │   ├── api-error.js        # Custom error class
│   │   └── async-handler.js    # Async error wrapper
│   ├── app.js                  # Express app configuration
│   └── server.js               # Server entry point
├── Dockerfile                  # MB-System compilation & Node setup
└── package.json
```
```

---

### 📝 How to use this:
1. Copy the code block above.
2. Save it as `backend/README.md`.
3. This document now perfectly matches the code you have written and the Dockerfile you built.

**Are you ready to move on to the Next.js Frontend now?**


📡 API Reference
Base URL: http://localhost:4000/api/v1

📋 API List Overview
Method
Endpoint
Purpose
GET
/health
Checks if the server and conversion tools are running.
POST
/jobs
Uploads a .all file and starts the conversion process.
GET
/jobs/:jobId
Checks the status/progress of a conversion job.
GET
/jobs/:jobId/download
Downloads the final converted .las file