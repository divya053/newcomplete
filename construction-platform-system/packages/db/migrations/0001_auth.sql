-- 0001 — Better Auth core schema (ws 0.3), MariaDB port. The global identity tables
-- Better Auth owns (email + password, server-side sessions). Column names are
-- camelCase and backtick-quoted because that's what Better Auth's adapter expects;
-- `user` is quoted as it's a reserved word. These are NOT tenant-scoped (global
-- identity, like orgs) — no org_id. The app reads them via the app user.
--
-- PORT NOTE: text->VARCHAR(255) for id/unique columns; boolean->TINYINT(1);
-- timestamptz->DATETIME(3). Better Auth supplies createdAt/updatedAt itself.

CREATE TABLE IF NOT EXISTS `user` (
  `id` VARCHAR(255) NOT NULL,
  `name` TEXT NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `emailVerified` TINYINT(1) NOT NULL DEFAULT 0,
  `image` TEXT,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_email_uq` (`email`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `session` (
  `id` VARCHAR(255) NOT NULL,
  `userId` VARCHAR(255) NOT NULL,
  `token` VARCHAR(255) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `ipAddress` TEXT,
  `userAgent` TEXT,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `session_token_uq` (`token`),
  CONSTRAINT `session_user_fk` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `account` (
  `id` VARCHAR(255) NOT NULL,
  `userId` VARCHAR(255) NOT NULL,
  `accountId` TEXT NOT NULL,
  `providerId` TEXT NOT NULL,
  `accessToken` TEXT,
  `refreshToken` TEXT,
  `accessTokenExpiresAt` DATETIME(3),
  `refreshTokenExpiresAt` DATETIME(3),
  `scope` TEXT,
  `idToken` TEXT,
  `password` TEXT,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `account_user_fk` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `verification` (
  `id` VARCHAR(255) NOT NULL,
  `identifier` TEXT NOT NULL,
  `value` TEXT NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;

-- Now that `user` exists, tie memberships.user_id to it.
ALTER TABLE memberships
  ADD CONSTRAINT memberships_user_fk FOREIGN KEY (user_id) REFERENCES `user`(`id`) ON DELETE CASCADE;
