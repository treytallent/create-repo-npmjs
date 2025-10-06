#!/usr/bin/env node

import { execSync } from 'child_process'
import inquirer from 'inquirer'
import { readdirSync, existsSync, renameSync, rmSync } from 'fs'
import { join } from 'path'

const ORG_NAME = 'Blue-Kelpie'

function run(cmd, opts = {}) {
	return execSync(cmd, { stdio: 'inherit', ...opts })
}

function runAndGet(cmd) {
	return execSync(cmd, { encoding: 'utf8' }).trim()
}

async function main() {
	console.log('\n🚀 Welcome to the Repository Initializer\n')

	const cwd = process.cwd()
	const folderContents = readdirSync(cwd)
	const isEmpty = folderContents.length === 0

	// 1️⃣ Fetch template repositories
	console.log('🔍 Fetching available templates...\n')
	const templatesRaw = runAndGet(
		`gh api orgs/${ORG_NAME}/repos --paginate --jq '.[] | select(.is_template==true) | {name: .name, description: .description}'`
	)

	if (!templatesRaw) {
		console.error('❌ No template repositories found in your organization.')
		process.exit(1)
	}

	const templates = templatesRaw
		.split('\n')
		.filter(Boolean)
		.map(line => JSON.parse(line))

	// 2️⃣ Let user pick a template
	const { template } = await inquirer.prompt([
		{
			type: 'list',
			name: 'template',
			message: 'Select a template:',
			choices: templates.map(t => ({
				name: `${t.name}${t.description ? ` — ${t.description}` : ''}`,
				value: t.name,
			})),
		},
	])

	// 3️⃣ Ask for repository name
	const { repoName } = await inquirer.prompt([
		{
			type: 'input',
			name: 'repoName',
			message: 'Enter the new repository name:',
			validate: input => input.trim().length > 0 || 'Repository name cannot be empty',
		},
	])

	// 4️⃣ Create the GitHub repo from the template
	console.log(`\n🏗️  Creating ${ORG_NAME}/${repoName} from ${template}...`)
	run(`gh repo create ${ORG_NAME}/${repoName} --template ${ORG_NAME}/${template} --public`)

	// 5️⃣ Clone into current directory or temporary one
	console.log('\n📦 Cloning repository...')

	if (isEmpty) {
		// Folder is empty → clone directly into it
		run(`git clone git@github.com:${ORG_NAME}/${repoName}.git .`)
	} else {
		// Folder has content → clone into __tmp_repo__
		const tmpDir = join(cwd, '__tmp_repo__')
		run(`git clone git@github.com:${ORG_NAME}/${repoName}.git "${tmpDir}"`)

		console.log('\n📁 Merging __tmp_repo__ contents into current directory...')

		// Move all files (including dotfiles)
		const tmpContents = readdirSync(tmpDir, { withFileTypes: true })
		for (const entry of tmpContents) {
			const src = join(tmpDir, entry.name)
			const dest = join(cwd, entry.name)
			renameSync(src, dest)
		}

		// Remove the now-empty temp folder
		rmSync(tmpDir, { recursive: true, force: true })

		console.log('✅ Template files moved into current folder.')
	}

	// 6️⃣ Initialize or update Git
	if (!existsSync(join(cwd, '.git'))) {
		console.log('\n🌀 Initializing new Git repository...')
		run(`git init`)
	}
}

main().catch(err => {
	console.error('\n❌ Error:', err.message)
	process.exit(1)
})
