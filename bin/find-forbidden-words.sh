#!/bin/bash

# Forbidden words check for pre-commit and CI
# Searches for debug statements that should not be committed.
# console.log/debug inside environment checks (NODE_ENV, isDev, LOG_*) are allowed.

declare -a console_words=("console.log(" "console.debug(")
declare -a always_forbidden=("debugger")
declare -a folders=("src")
declare -a exclude_folders=("node_modules" "dist" "build" ".git")

# Environment guard patterns (if found within 5 lines above, console statement is allowed)
ENV_PATTERNS="NODE_ENV|isDev|isDevelopment|LOG_QUERIES|import\.meta\.env\.DEV"

# Prepare the exclude parameters for grep
exclude_params=""
for exclude_folder in "${exclude_folders[@]}"; do
  exclude_params="$exclude_params --exclude-dir=$exclude_folder"
done

found_forbidden_word=0

echo "Starting search for forbidden words..."
printf "%-10s | %-50s | %s\n" "Line" "Content" "File"
printf "%-10s | %-50s | %s\n" "----" "-------" "----"

# Check always-forbidden words (debugger) - no exceptions
for folder in "${folders[@]}"; do
  for word in "${always_forbidden[@]}"; do
    matches=$(grep -rn $exclude_params "$folder" -e "$word" 2>/dev/null)
    if [ $? -eq 0 ]; then
      while IFS= read -r match; do
        file=$(echo "$match" | cut -d: -f1)
        line=$(echo "$match" | cut -d: -f2)
        content=$(echo "$match" | cut -d: -f3-)
        absolute_file=$(realpath "$file")
        printf "%-10s | %-50s | %s\n" "$line" "$content" "$absolute_file"
        found_forbidden_word=1
      done <<< "$matches"
    fi
  done
done

# Check console statements - but allow those inside environment guards
for folder in "${folders[@]}"; do
  for word in "${console_words[@]}"; do
    matches=$(grep -rn $exclude_params "$folder" -e "$word" 2>/dev/null)
    if [ $? -eq 0 ]; then
      while IFS= read -r match; do
        file=$(echo "$match" | cut -d: -f1)
        line=$(echo "$match" | cut -d: -f2)
        content=$(echo "$match" | cut -d: -f3-)

        # Check 5 lines above for environment guard pattern
        start_line=$((line - 5))
        if [ $start_line -lt 1 ]; then
          start_line=1
        fi

        context=$(sed -n "${start_line},${line}p" "$file" 2>/dev/null)
        if echo "$context" | grep -qE "$ENV_PATTERNS"; then
          # Inside environment guard - skip
          continue
        fi

        absolute_file=$(realpath "$file")
        printf "%-10s | %-50s | %s\n" "$line" "$content" "$absolute_file"
        found_forbidden_word=1
      done <<< "$matches"
    fi
  done
done

if [ $found_forbidden_word -eq 1 ]; then
  RED='\033[0;31m'
  NC='\033[0m'
  printf "${RED}Error: Found one or more forbidden words (unguarded console.log/debug, debugger).${NC}\n"
  printf "Hint: Wrap dev-only logging in an environment check to allow it.\n"
  exit 1
else
  SUCCESS='\033[0;32m'
  NC='\033[0m'
  printf "${SUCCESS}No forbidden debug statements found.${NC}\n"
  exit 0
fi
