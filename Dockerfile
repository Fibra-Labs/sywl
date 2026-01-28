FROM node:24-slim
WORKDIR /app

# Copy package files
COPY package*.json ./

# Remove lock file and install fresh for AMD64 & ARM64
RUN rm -f package-lock.json && npm install

# Copy everything
COPY . .

# Build
RUN npm run build

# Remove dev dependencies

# Expose port
EXPOSE 3000

# Run
CMD ["sh", "-c", "npm run db:migrate && node build"]
