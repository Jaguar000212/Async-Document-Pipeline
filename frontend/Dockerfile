FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* yarn.lock* ./

# Install dependencies
RUN npm install

# Copy frontend code
COPY . .

# Expose port for Next.js
EXPOSE 3000

# Development server (with --turbopack for faster rebuilds)
CMD ["npm", "run", "dev"]

