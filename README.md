<h1>
  <!-- Image is commented out because of anonymity 
  -->
  Sprout Source Code
</h1>

Welcome! This repository contains the source code for the Sprout VS Code extension.

## Overview

(Please note that the words "workflow", "task" and "course" are used interchangeably in this README.)

Sprout is a VS Code extension that is intended as a learning aid for anyone who wants to expand their programming knowledge by solving exercises.
The extension enables the user to complete a stepwise workflow of solving a task, where the task is derived from a previously resolved GitHub issue from
a given open-source software repository (OSS). The workflow provides context for the OSS and breaks down the issue in smaller steps. 

Each step is complete with a description of the needed code changes, inline code lenses, optional hints and a possibility to view an example solution. 
Working with Sprout is intended to be a helpful experience for a learner, and to be an introduction to the world of open-source programming.

Please note that this repository contains only the source code for the extension's user interface and its components as they appear in VS Code.
It does not contain the text content that the UI components display and it does not contain the setup configuration necessary for launching the extension. 
These elements are contained in separate repositories. 
This is explained the [Architecture](#architecture) section below.

At the time of writing of this README, the extension is not published to the VS Code marketplace and is therefore distributed as a `.vsix` package / ZIP archive.
The latest version of the package is included in this repository. 

## Architecture

### Workflow Configuration
Upon activation in VS Code, Sprout's first action is to parse a specific set of configuration files and load their content into memory. 
It looks for these files under the `data/structured-courses` path relative to its working directory. 
If it does not find these files, or if they have an unexpected structure, it displays a blank screen in VS Code or it renders an incomplete UI.

For the currently supported workflows/tasks, these files are stored in the accompanying Sprout Course Collection repository. Each "course" subfolder there contains all configuration files with all the needed content for a particular workflow/task. 
Please consult its README if you want to know more about the structure of these files. 

The Sprout Course Collection repository is a git submodule of this repository under the `data/structured-courses` path
and is packaged with it whenever a new `.vsix` package is produced. Sprout then chooses the configuration files of which course to parse, 
based on an environment variable that is contained in the setup logic needed for launching the extension. 

### Launching Sprout

A Sprout workflow is intended to be completed within a GitHub Codespace and, therefore, Sprout can only be launched within a development container (i.e. a dev container).
Each workflow configured in the Sprout Course Collection repository has an additional corresponding repository that can set up a dev container to launch Sprout. There is a list of all available courses and their launch repos in the README of the Sprout Course Collection repository. (For purposes of anonymity, this list is currently removed.) 

When launching this dev container, the `.devcontainer` file instructs that the container should clone the target OSS where the task is derived from and installs all necessary utilities to compile the target OSS at the commit when the GitHub issue was opened. It also configures the necessary environment variables and installs Sprout via the `.vsix` package.

Each course needs its own such dev container setup repository because the workflow is intended to run in a GitHub Codespace and, to avoid long set-up times, the Codespace needs to be pre-built. At the time of writing, GitHub allows pre-building only of the top-most `.devcontainer` configuration in a given repository.

<!-- The image shows the launch process in steps. -->

<!-- Image is commented out because specifying a repository in package.json 
     is needed for the image to be found but specifying a repository in package.json will violate anonymity --> 

## How to run a Sprout workflow from a user's perspective

To run a Sprout workflow, go to the Sprout Course Collection repository, select a course you like, open its subfolder and go through its README. Towards the bottom of the README, you should see a button "Open in GitHub Codespaces". This will launch Sprout for your desired workflow in a GitHub Codespace.

## How to run a Sprout workflow from a developer's perspective

If you're a developer and you would like to run a Sprout workflow locally, do the following:

1. Install the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
2. Clone and open locally the devcontainer configuration repo of your desired Sprout workflow.
3. Delete its old `.vsix` file and replace it with your newly packaged `.vsix` file. (To produce a new `.vsix`, you can do `npx vsce package`.)
4. Open the repo in a Dev Container using the Dev Containers extension.

## How to add a new course/workflow

If you would like to create a new course/workflow, please follow the directions to do so in the README of the Sprout Course Collection repository.

