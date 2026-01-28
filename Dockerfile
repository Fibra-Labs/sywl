FROM node:24-slim
WORKDIR /app

ARG DATABASE_URL=file:data/local.db
ARG GROQ_API_KEY
ARG SPOTIFY_CLIENT_ID
ARG SPOTIFY_CLIENT_SECRET
ARG SPOTIFY_REDIRECT_URI
ARG ORIGIN

ENV DATABASE_URL=$DATABASE_URL
ENV GROQ_API_KEY=$GROQ_API_KEY
ENV SPOTIFY_CLIENT_ID=$SPOTIFY_CLIENT_ID
ENV SPOTIFY_CLIENT_SECRET=$SPOTIFY_CLIENT_SECRET
ENV SPOTIFY_REDIRECT_URI=$SPOTIFY_REDIRECT_URI
ENV ORIGIN=$ORIGIN

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
