-- Events schema for planning gatherings (dinner parties, vacations, birthdays, etc.)
CREATE SCHEMA IF NOT EXISTS events;

--------------------------------------------------------------------------------
-- CORE EVENTS TABLE
-- The central entity - can represent any type of gathering/event
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events.events (
    id SERIAL PRIMARY KEY,

    -- Event type allows filtering and UI customization per event kind
    -- Examples: 'dinner_party', 'vacation', 'birthday', 'game_night', 'potluck'
    event_type VARCHAR(50) NOT NULL DEFAULT 'gathering',

    -- Basic info
    title VARCHAR(255) NOT NULL,
    description TEXT,

    -- Location can be simple text or structured (address parsed client-side if needed)
    location TEXT,

    -- Planning workflow status
    -- 'draft' -> 'planning' -> 'confirmed' -> 'completed' (or 'cancelled')
    status VARCHAR(20) NOT NULL DEFAULT 'draft',

    -- Once a date/time is confirmed, store it here for easy querying
    confirmed_date DATE,
    confirmed_time_start TIME,
    confirmed_time_end TIME,

    -- Organizer/creator (simple identifier - could be name, email, or user_id)
    created_by VARCHAR(255) NOT NULL,

    -- Extensibility: store event-type-specific data as JSON
    -- e.g., for dinner_party: {"theme": "Italian", "dress_code": "casual"}
    -- e.g., for vacation: {"destination": "Lake Tahoe", "accommodation": "cabin"}
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

--------------------------------------------------------------------------------
-- PARTICIPANTS TABLE
-- Who's invited and their RSVP status
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events.participants (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events.events(id) ON DELETE CASCADE,

    -- Participant identity (flexible - name, email, or user_id)
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),

    -- Role in the event
    role VARCHAR(50) NOT NULL DEFAULT 'guest',  -- 'host', 'organizer', 'guest'

    -- RSVP status
    rsvp_status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending', 'yes', 'no', 'maybe'
    rsvp_note TEXT,  -- Optional note with their response

    -- Extensibility: per-participant custom data
    -- e.g., for dinner_party: {"bringing": "Caesar salad", "dietary_restrictions": ["vegetarian"]}
    -- e.g., for vacation: {"arrival_date": "2024-03-15", "room_preference": "lake view"}
    custom_data JSONB DEFAULT '{}',

    invited_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP WITH TIME ZONE,

    -- Prevent duplicate invites
    UNIQUE(event_id, email)
);

--------------------------------------------------------------------------------
-- PROPOSED DATES TABLE
-- For scheduling - propose multiple dates, let people vote
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events.proposed_dates (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events.events(id) ON DELETE CASCADE,

    proposed_date DATE NOT NULL,
    proposed_time_start TIME,
    proposed_time_end TIME,

    -- Who proposed this date
    proposed_by VARCHAR(255),

    -- Mark which date was selected
    is_selected BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

--------------------------------------------------------------------------------
-- DATE VOTES TABLE
-- Track participant availability for proposed dates
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events.date_votes (
    id SERIAL PRIMARY KEY,
    proposed_date_id INTEGER NOT NULL REFERENCES events.proposed_dates(id) ON DELETE CASCADE,
    participant_id INTEGER NOT NULL REFERENCES events.participants(id) ON DELETE CASCADE,

    -- Vote options: 'available', 'unavailable', 'maybe'
    vote VARCHAR(20) NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- One vote per participant per proposed date
    UNIQUE(proposed_date_id, participant_id)
);

--------------------------------------------------------------------------------
-- COMMENTS TABLE
-- Discussion thread for the event
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events.comments (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events.events(id) ON DELETE CASCADE,

    -- Who wrote the comment (matches participant name/identifier)
    author VARCHAR(255) NOT NULL,

    content TEXT NOT NULL,

    -- Optional: for threaded replies
    parent_id INTEGER REFERENCES events.comments(id) ON DELETE CASCADE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

--------------------------------------------------------------------------------
-- INDEXES
--------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_events_status ON events.events(status);
CREATE INDEX IF NOT EXISTS idx_events_type ON events.events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_confirmed_date ON events.events(confirmed_date);
CREATE INDEX IF NOT EXISTS idx_events_created_by ON events.events(created_by);

CREATE INDEX IF NOT EXISTS idx_participants_event_id ON events.participants(event_id);
CREATE INDEX IF NOT EXISTS idx_participants_email ON events.participants(email);
CREATE INDEX IF NOT EXISTS idx_participants_rsvp ON events.participants(event_id, rsvp_status);

CREATE INDEX IF NOT EXISTS idx_proposed_dates_event_id ON events.proposed_dates(event_id);
CREATE INDEX IF NOT EXISTS idx_date_votes_proposed_date ON events.date_votes(proposed_date_id);
CREATE INDEX IF NOT EXISTS idx_comments_event_id ON events.comments(event_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON events.comments(parent_id);

--------------------------------------------------------------------------------
-- TRIGGERS - Auto-update updated_at
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION events.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_events_updated_at
    BEFORE UPDATE ON events.events
    FOR EACH ROW
    EXECUTE FUNCTION events.update_timestamp();

CREATE TRIGGER set_comments_updated_at
    BEFORE UPDATE ON events.comments
    FOR EACH ROW
    EXECUTE FUNCTION events.update_timestamp();
