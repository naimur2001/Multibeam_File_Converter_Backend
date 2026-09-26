# Use Ubuntu 22.04 as the base image
FROM ubuntu:22.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Set environment variables (Fixed the LD_LIBRARY_PATH warning)
ENV PATH=/usr/local/bin:$PATH
ENV LD_LIBRARY_PATH=/usr/local/lib

# 1. Install basic tools and Node.js 20
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# 2. Install MB-System dependencies (Headless version)
# We skip libx11-dev and libmotif-dev because we will disable GUIs in CMake.
# Added libtirpc-dev, libhdf5-dev, and libxml2-dev which are often hidden requirements.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    git \
    gmt \
    libgmt-dev \
    libgdal-dev \
    gdal-bin \
    libproj-dev \
    libnetcdf-dev \
    libfftw3-dev \
    libhdf5-dev \
    libtirpc-dev \
    libxml2-dev \
    pdal \
    && rm -rf /var/lib/apt/lists/*

# 3. Clone and Build MB-System from source
RUN git clone https://github.com/dwcaress/MB-System.git /opt/MB-System

WORKDIR /opt/MB-System

# Build MB-System using CMake. 
# MAGIC FLAG: -DbuildGUIs=OFF skips X11/Motif dependencies for a headless server.
RUN mkdir build && cd build && \
    cmake -DCMAKE_BUILD_TYPE=Release -DbuildGUIs=OFF -DbuildOpenCV=OFF .. && \
    make -j$(nproc) && \
    make install && \
    ldconfig

# 4. Verify installation
RUN mbinfo --help || true
RUN pdal --version || true

# 5. Setup Node.js Backend
WORKDIR /app

# Copy package files first for Docker layer caching
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev || npm install --omit=dev

# Copy backend source code
COPY src ./src

# Create directory for job files
RUN mkdir -p /data/jobs

# Set default environment variables
ENV NODE_ENV=production
ENV PORT=4000
ENV UPLOAD_DIR=/data/jobs
ENV MAX_FILE_MB=50
ENV FRONTEND_ORIGIN=http://localhost:3000
ENV JOB_TTL_MINUTES=15
ENV CLEANUP_INTERVAL_MINUTES=5
ENV MAX_CONCURRENT_JOBS=1
ENV COMMAND_TIMEOUT_MS=600000

# Expose the backend port
EXPOSE 4000

# Start the Express backend
CMD ["node", "src/server.js"]