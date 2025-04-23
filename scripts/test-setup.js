// Direkte Datenbankverbindung für Tests
const mysql = require('promise-mysql');
const humps = require('humps');
const argon2 = require('argon2');

// Eigene Crypto-Funktionen für Tests
const crypto = {
  async hash(plainTextValue) {
    return await argon2.hash(plainTextValue);
  }
};

// Datenbank-Konfiguration für Docker-Umgebung
const config = {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: '1234',
  database: 'application',
  connectionLimit: 100
};

// Hilfs-Funktionen für Datenbankzugriff
async function baseQuery(sql, params) {
  let connection;
  console.log("SQL:", sql);
  console.log("PARAMS:", JSON.stringify(params));
  try {
    connection = await mysql.createConnection(config);
    return await connection.query(sql, params);
  } catch (err) {
    console.error("DB Error:", err);
    throw err;
  } finally {
    if (connection) await connection.end();
  }
}

async function query(sql, params) {
  const result = await baseQuery(sql, params);
  return result?.length > 0 ? humps.camelizeKeys(result) : null;
}

async function setupTestData() {
  console.log('Prüfe und erstelle Testdaten für Load Tests...');
  
  // 1. Prüfen, ob Test-Organisator existiert
  const organizerExists = await query(
    'SELECT COUNT(*) as count FROM organizer WHERE email = ?', 
    ['loadtest@example.org']
  );
  
  let organizerId;
  
  // Organisator anlegen, falls nicht vorhanden
  if (!organizerExists || organizerExists[0].count === 0) {
    console.log('Erstelle Test-Organisator...');
    const passwordHash = await crypto.hash('TestPassword123!');
    
    const result = await baseQuery(`
      INSERT INTO organizer (email, password, public_name, public_organisation, verified, username, create_datetime) 
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `, ['loadtest@example.org', passwordHash, 'Load Test', 'Test Organization', 'loadtest', Math.floor(Date.now() / 1000)]);
    
    organizerId = result.insertId;
    console.log(`Organisator erstellt mit ID: ${organizerId}`);
  } else {
    // Organisator-ID abrufen
    const organizer = await query(
      'SELECT id FROM organizer WHERE email = ?',
      ['loadtest@example.org']
    );
    organizerId = organizer[0].id;
    console.log(`Vorhandener Organisator mit ID: ${organizerId}`);
  }

  // 3. Prüfen, ob Test-Event existiert
  const eventExists = await query(
    'SELECT COUNT(*) as count FROM event WHERE slug = ?',
    ['loadtest-event']
  );
  
  // Event anlegen oder ID abrufen
  let eventId;
  if (!eventExists || eventExists[0].count === 0) {
    console.log('Erstelle Test-Event...');
    // Zeitstempel für Eventzeiten
    
    const currentTime = Math.floor(Date.now() / 1000);
    const endTime = currentTime + 86400; // 24 Stunden in Sekunden
    
    const result = await baseQuery(`
      INSERT INTO event (
        organizer_id, title, slug, active, 
        create_datetime, end_datetime, description, 
        lobby_open
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      organizerId, 'Load Test Event', 'loadtest-event', 1,
      currentTime, endTime, 'Event für Lasttests', 
      1
    ]);
    eventId = result.insertId;
    console.log(`Event erstellt mit ID: ${eventId}`);
  } else {
    const event = await query(
      'SELECT id FROM event WHERE slug = ?',
      ['loadtest-event']
    );
    eventId = event[0].id;
    console.log(`Vorhandenes Event mit ID: ${eventId}`);
  }
  
  // 4. Test-Benutzer anlegen (falls nicht vorhanden)
  console.log('Prüfe und erstelle Test-Benutzer...');
  const batchSize = 10;
  for (let i = 1; i <= 150; i++) {
    const username = `testuser${i}`;
    const userExists = await query(
      'SELECT COUNT(*) as count FROM event_user WHERE username = ? AND event_id = ?',
      [username, eventId]
    );
    
    if (!userExists || userExists[0].count === 0) {
      if (i % batchSize === 1) {
        console.log(`Erstelle Benutzer ${i} bis ${Math.min(i + batchSize - 1, 150)}...`);
      }
      
      const passwordHash = await crypto.hash('test123');
      
      await baseQuery(`
        INSERT INTO event_user (
          event_id, username, email, password, public_name,
          allow_to_vote, verified, create_datetime
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        eventId, username, `${username}@example.org`, passwordHash, `User ${i}`,
        1, 1, Math.floor(Date.now() / 1000) // Vollwertiger Teilnehmer mit Stimmrecht
      ]);
    }
  }
  
  // 5. Test-Umfragen erstellen
  for (let p = 1; p <= 3; p++) {
    const pollTitle = `Load Test Poll ${p}`;
    const pollExists = await query(
      'SELECT COUNT(*) as count FROM poll WHERE title = ? AND event_id = ?',
      [pollTitle, eventId]
    );
    
    if (!pollExists || pollExists[0].count === 0) {
      console.log(`Erstelle Test-Umfrage ${p}...`);
      
      const currentTime = Math.floor(Date.now() / 1000);
      const pollResult = await baseQuery(`
        INSERT INTO poll (
          event_id, title, poll_answer, create_datetime, 
          type, max_votes, allow_abstain
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        eventId, pollTitle, `Umfrage ${p} für Lasttests`, currentTime, 
        0, p === 2 ? 3 : 1, 1 // type=0 Standardabstimmung, max_votes=3 für multi-choice
      ]);
      
      const pollId = pollResult.insertId;
      
      // Antwortmöglichkeiten hinzufügen
      const answerTime = Math.floor(Date.now() / 1000);
      await baseQuery(`
        INSERT INTO poll_possible_answer (poll_id, content, create_datetime)
        VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)
      `, [
        pollId, 'Ja', answerTime, 
        pollId, 'Nein', answerTime, 
        pollId, 'Enthaltung', answerTime
      ]);
      
      console.log(`Umfrage ${p} erstellt mit ID: ${pollId}`);
    } else {
      console.log(`Umfrage ${pollTitle} existiert bereits`);
    }
  }
  
  console.log('Setup abgeschlossen!');
  console.log('\nTestdaten Login-Informationen:');
  console.log('------------------------------');
  console.log('Organisator:');
  console.log('  Email: loadtest@example.org');
  console.log('  Passwort: TestPassword123!');
  console.log('  Event: loadtest-event');
  console.log('\nTeilnehmer:');
  console.log('  Benutzernamen: testuser1 bis testuser150');
  console.log('  Passwort für alle: test123');
}

// Ausführen
setupTestData().catch(err => {
  console.error('Fehler beim Setup der Testdaten:', err);
  process.exit(1);
});