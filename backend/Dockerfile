# Backend Dockerfile for NaukriWala
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application code
COPY . .

# Expose port
EXPOSE 4000

# Start the application
CMD ["npm", "start"]
