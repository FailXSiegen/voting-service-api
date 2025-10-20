#!/usr/bin/env node

/**
 * Script to clear all shortlinks for a specific event
 * Usage: npm run clear-shortlinks -- <eventId>
 */

import { deleteAllByEventId } from "../repository/event-user-shortlink-repository.js";
import { findById as findEventById } from "../repository/event-repository.js";

async function clearShortlinks() {
  const eventId = process.argv[2];

  if (!eventId) {
    console.error("❌ Error: Event ID is required");
    console.log("Usage: npm run clear-shortlinks -- <eventId>");
    process.exit(1);
  }

  const parsedEventId = parseInt(eventId);
  if (isNaN(parsedEventId)) {
    console.error("❌ Error: Event ID must be a number");
    process.exit(1);
  }

  try {
    // Check if event exists
    const event = await findEventById(parsedEventId);
    if (!event) {
      console.error(`❌ Error: Event with ID ${parsedEventId} not found`);
      process.exit(1);
    }

    console.log(`🔍 Found event: ${event.title} (ID: ${parsedEventId})`);
    console.log(`🗑️  Deleting all shortlinks for this event...`);

    const result = await deleteAllByEventId(parsedEventId);

    if (result) {
      console.log("✅ All shortlinks deleted successfully");
    } else {
      console.error("❌ Failed to delete shortlinks");
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

clearShortlinks();
