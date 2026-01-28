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

RUN npm run db:migrate

# Remove dev dependencies
RUN npm prune --omit=dev

# Expose port
EXPOSE 3000

# Run
CMD ["node", "build"]
