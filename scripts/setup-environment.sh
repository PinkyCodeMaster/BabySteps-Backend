#!/bin/bash

# Environment setup script
# Usage: ./scripts/setup-environment.sh [staging|production]

set -e

ENVIRONMENT=${1:-staging}

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Environment Setup - $ENVIRONMENT${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to prompt for input
prompt_input() {
    local var_name=$1
    local prompt_text=$2
    local is_secret=${3:-false}
    
    if [ "$is_secret" = true ]; then
        read -sp "$prompt_text: " value
        echo ""
    else
        read -p "$prompt_text: " value
    fi
    
    echo "$value"
}

# Function to generate secret
generate_secret() {
    openssl rand -base64 48
}

echo -e "${YELLOW}This script will help you set up environment variables for $ENVIRONMENT${NC}"
echo ""

# Check if .env file already exists
ENV_FILE=".env.$ENVIRONMENT"
if [ -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}⚠️  Warning: $ENV_FILE already exists${NC}"
    read -p "Do you want to overwrite it? (y/N): " overwrite
    if [ "$overwrite" != "y" ] && [ "$overwrite" != "Y" ]; then
        echo "Exiting without changes"
        exit 0
    fi
    # Backup existing file
    cp "$ENV_FILE" "${ENV_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
    echo -e "${GREEN}✅ Backed up existing file${NC}"
fi

# Create new .env file
echo "# Environment: $ENVIRONMENT" > "$ENV_FILE"
echo "# Generated: $(date)" >> "$ENV_FILE"
echo "" >> "$ENV_FILE"

# Database Configuration
echo -e "${BLUE}📊 Database Configuration${NC}"
DATABASE_URL=$(prompt_input "DATABASE_URL" "Enter Neon PostgreSQL connection string")
echo "DATABASE_URL=$DATABASE_URL" >> "$ENV_FILE"
echo ""

# Authentication Configuration
echo -e "${BLUE}🔐 Authentication Configuration${NC}"
echo "Generating BETTER_AUTH_SECRET..."
BETTER_AUTH_SECRET=$(generate_secret)
echo "BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET" >> "$ENV_FILE"
echo -e "${GREEN}✅ Generated BETTER_AUTH_SECRET${NC}"

if [ "$ENVIRONMENT" = "production" ]; then
    BETTER_AUTH_URL="https://api.yourdomain.com"
else
    BETTER_AUTH_URL="https://api-staging.yourdomain.com"
fi
read -p "BETTER_AUTH_URL [$BETTER_AUTH_URL]: " custom_url
BETTER_AUTH_URL=${custom_url:-$BETTER_AUTH_URL}
echo "BETTER_AUTH_URL=$BETTER_AUTH_URL" >> "$ENV_FILE"
echo ""

# CORS Configuration
echo -e "${BLUE}🌐 CORS Configuration${NC}"
if [ "$ENVIRONMENT" = "production" ]; then
    DEFAULT_ORIGINS="https://yourdomain.com,https://www.yourdomain.com"
else
    DEFAULT_ORIGINS="https://staging.yourdomain.com"
fi
read -p "ALLOWED_ORIGINS [$DEFAULT_ORIGINS]: " custom_origins
ALLOWED_ORIGINS=${custom_origins:-$DEFAULT_ORIGINS}
echo "ALLOWED_ORIGINS=$ALLOWED_ORIGINS" >> "$ENV_FILE"
echo ""

# Server Configuration
echo -e "${BLUE}⚙️  Server Configuration${NC}"
echo "PORT=9000" >> "$ENV_FILE"
echo "NODE_ENV=production" >> "$ENV_FILE"

if [ "$ENVIRONMENT" = "production" ]; then
    echo "LOG_LEVEL=warn" >> "$ENV_FILE"
else
    echo "LOG_LEVEL=info" >> "$ENV_FILE"
fi
echo ""

# Sentry Configuration
echo -e "${BLUE}🐛 Error Tracking (Sentry)${NC}"
read -p "Do you want to configure Sentry? (y/N): " configure_sentry
if [ "$configure_sentry" = "y" ] || [ "$configure_sentry" = "Y" ]; then
    SENTRY_DSN=$(prompt_input "SENTRY_DSN" "Enter Sentry DSN")
    echo "SENTRY_DSN=$SENTRY_DSN" >> "$ENV_FILE"
    echo "SENTRY_ENVIRONMENT=$ENVIRONMENT" >> "$ENV_FILE"
    
    if [ "$ENVIRONMENT" = "production" ]; then
        echo "SENTRY_TRACES_SAMPLE_RATE=0.1" >> "$ENV_FILE"
    else
        echo "SENTRY_TRACES_SAMPLE_RATE=0.5" >> "$ENV_FILE"
    fi
fi
echo ""

# Redis Configuration
echo -e "${BLUE}💾 Caching (Redis)${NC}"
read -p "Do you want to configure Redis? (y/N): " configure_redis
if [ "$configure_redis" = "y" ] || [ "$configure_redis" = "Y" ]; then
    REDIS_URL=$(prompt_input "REDIS_URL" "Enter Redis connection string")
    echo "REDIS_URL=$REDIS_URL" >> "$ENV_FILE"
fi
echo ""

# Rate Limiting Configuration
echo -e "${BLUE}🚦 Rate Limiting${NC}"
echo "RATE_LIMIT_ENABLED=true" >> "$ENV_FILE"
echo "RATE_LIMIT_AUTH_MAX=5" >> "$ENV_FILE"
echo "RATE_LIMIT_AUTH_WINDOW=900000" >> "$ENV_FILE"
echo "RATE_LIMIT_API_MAX=100" >> "$ENV_FILE"
echo "RATE_LIMIT_API_WINDOW=60000" >> "$ENV_FILE"
echo ""

# Feature Flags
echo -e "${BLUE}🎛️  Feature Flags${NC}"
echo "ENABLE_BABY_STEPS=true" >> "$ENV_FILE"
echo "ENABLE_UC_CALCULATIONS=true" >> "$ENV_FILE"
echo "ENABLE_EXPORT=true" >> "$ENV_FILE"
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Environment setup complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Environment file created: $ENV_FILE"
echo ""
echo -e "${YELLOW}⚠️  Important:${NC}"
echo "1. Review the generated file: $ENV_FILE"
echo "2. DO NOT commit this file to git"
echo "3. Add it to .gitignore if not already there"
echo "4. Set these variables in your deployment platform"
echo ""

# Show summary
echo -e "${BLUE}Summary:${NC}"
echo "  Environment: $ENVIRONMENT"
echo "  Database: Configured"
echo "  Auth Secret: Generated"
echo "  CORS: Configured"
echo "  Sentry: $([ "$configure_sentry" = "y" ] && echo "Configured" || echo "Skipped")"
echo "  Redis: $([ "$configure_redis" = "y" ] && echo "Configured" || echo "Skipped")"
echo ""

# Offer to set variables in Railway
if command -v railway &> /dev/null; then
    read -p "Do you want to set these variables in Railway? (y/N): " set_railway
    if [ "$set_railway" = "y" ] || [ "$set_railway" = "Y" ]; then
        echo "Setting variables in Railway..."
        railway environment $ENVIRONMENT
        
        while IFS='=' read -r key value; do
            # Skip comments and empty lines
            if [[ ! $key =~ ^# ]] && [ -n "$key" ]; then
                railway variables set "$key=$value"
            fi
        done < "$ENV_FILE"
        
        echo -e "${GREEN}✅ Variables set in Railway${NC}"
    fi
fi

echo ""
echo -e "${GREEN}Setup complete! You can now deploy to $ENVIRONMENT${NC}"
