CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    passwordEncrypted VARCHAR(500) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    dateCreated VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS books (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    dateCreated VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS book_access (
    bookId VARCHAR(50) NOT NULL,
    userId VARCHAR(50) NOT NULL,
    permission VARCHAR(20) NOT NULL DEFAULT 'read',
    PRIMARY KEY (bookId, userId),
    FOREIGN KEY (bookId) REFERENCES books(id),
    FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sections (
    id VARCHAR(50) PRIMARY KEY,
    bookId VARCHAR(50) NOT NULL,
    parentId VARCHAR(50),
    title VARCHAR(500) NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    analysis TEXT NOT NULL DEFAULT '',
    orderIndex INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    type VARCHAR(20) NOT NULL DEFAULT 'text',
    mediaId VARCHAR(50),
    caption TEXT NOT NULL DEFAULT '',
    dateCreated VARCHAR(100) NOT NULL,
    dateUpdated VARCHAR(100) NOT NULL,
    FOREIGN KEY (bookId) REFERENCES books(id),
    FOREIGN KEY (parentId) REFERENCES sections(id)
);

CREATE TABLE IF NOT EXISTS section_versions (
    id VARCHAR(50) PRIMARY KEY,
    sectionId VARCHAR(50) NOT NULL,
    version INTEGER NOT NULL,
    title VARCHAR(500) NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    analysis TEXT NOT NULL DEFAULT '',
    type VARCHAR(20) NOT NULL DEFAULT 'text',
    mediaId VARCHAR(50),
    caption TEXT NOT NULL DEFAULT '',
    dateCreated VARCHAR(100) NOT NULL,
    FOREIGN KEY (sectionId) REFERENCES sections(id)
);

CREATE TABLE IF NOT EXISTS book_properties (
    id VARCHAR(50) PRIMARY KEY,
    bookId VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'text',
    options TEXT NOT NULL DEFAULT '[]',
    dateCreated VARCHAR(100) NOT NULL,
    FOREIGN KEY (bookId) REFERENCES books(id)
);

CREATE TABLE IF NOT EXISTS section_properties (
    sectionId VARCHAR(50) NOT NULL,
    propertyId VARCHAR(50) NOT NULL,
    value TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (sectionId, propertyId),
    FOREIGN KEY (sectionId) REFERENCES sections(id),
    FOREIGN KEY (propertyId) REFERENCES book_properties(id)
);

CREATE TABLE IF NOT EXISTS book_attributes (
    id VARCHAR(50) PRIMARY KEY,
    bookId VARCHAR(50) NOT NULL,
    title VARCHAR(500) NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    version INTEGER NOT NULL DEFAULT 1,
    dateCreated VARCHAR(100) NOT NULL,
    dateUpdated VARCHAR(100) NOT NULL,
    FOREIGN KEY (bookId) REFERENCES books(id)
);

CREATE TABLE IF NOT EXISTS book_attribute_versions (
    id VARCHAR(50) PRIMARY KEY,
    attributeId VARCHAR(50) NOT NULL,
    version INTEGER NOT NULL,
    title VARCHAR(500) NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    dateCreated VARCHAR(100) NOT NULL,
    FOREIGN KEY (attributeId) REFERENCES book_attributes(id)
);

CREATE TABLE IF NOT EXISTS api_tokens (
    id VARCHAR(50) PRIMARY KEY,
    userId VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL DEFAULT '',
    token TEXT NOT NULL,
    dateCreated VARCHAR(100) NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS media (
    id VARCHAR(50) PRIMARY KEY,
    bookId VARCHAR(50) NOT NULL,
    slug VARCHAR(200) NOT NULL,
    filename VARCHAR(500) NOT NULL,
    mimeType VARCHAR(100) NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    dateCreated VARCHAR(100) NOT NULL,
    FOREIGN KEY (bookId) REFERENCES books(id),
    UNIQUE(bookId, slug)
);
