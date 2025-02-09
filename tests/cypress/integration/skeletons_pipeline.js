// Copyright (C) 2022 CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

/// <reference types="cypress" />

context('Manipulations with skeletons', () => {
    const skeletonSize = 5;
    const labelName = 'skeleton';
    const taskName = 'skeletons main pipeline';
    const imagesFolder = `cypress/fixtures/${taskName}`;
    const archiveName = `${taskName}.zip`;
    const archivePath = `cypress/fixtures/${archiveName}`;
    const imageParams = {
        width: 800,
        height: 800,
        color: 'gray',
        textOffset: { x: 10, y: 10 },
        text: 'skeletons pipeline',
        count: 5,
    };
    let taskID = null;

    before(() => {
        cy.visit('auth/login');
        cy.login();
        cy.imageGenerator(
            imagesFolder,
            taskName,
            imageParams.width,
            imageParams.height,
            imageParams.color,
            imageParams.textOffset.x,
            imageParams.textOffset.y,
            imageParams.text,
            imageParams.count,
        );
        cy.createZipArchive(imagesFolder, archivePath);
    });

    after(() => {
        cy.getAuthKey().then((response) => {
            const authKey = response.body.key;
            cy.request({
                method: 'DELETE',
                url: `/api/tasks/${taskID}`,
                headers: {
                    Authorization: `Token ${authKey}`,
                },
            });
        });
    });

    describe('Create a task with skeletons', () => {
        it('Create a simple task', () => {
            cy.visit('/tasks/create');
            cy.get('#name').type(taskName);
            cy.get('.cvat-constructor-viewer-new-skeleton-item').click();
            cy.get('.cvat-skeleton-configurator').should('exist').and('be.visible');

            cy.get('.cvat-label-constructor-creator').within(() => {
                cy.get('#name').type(labelName);
                cy.get('.ant-radio-button-checked').within(() => {
                    cy.get('.ant-radio-button-input').should('have.attr', 'value', 'point');
                });
            });

            const pointsOffset = [
                { x: 0.55, y: 0.15 },
                { x: 0.20, y: 0.35 },
                { x: 0.43, y: 0.55 },
                { x: 0.63, y: 0.38 },
                { x: 0.27, y: 0.15 },
            ];
            expect(skeletonSize).to.be.equal(pointsOffset.length);

            cy.get('.cvat-skeleton-configurator-svg').then(($canvas) => {
                const canvas = $canvas[0];

                canvas.scrollIntoView();
                const rect = canvas.getBoundingClientRect();
                const { width, height } = rect;
                pointsOffset.forEach(({ x: xOffset, y: yOffset }) => {
                    canvas.dispatchEvent(new MouseEvent('mousedown', {
                        clientX: rect.x + width * xOffset,
                        clientY: rect.y + height * yOffset,
                        button: 0,
                        bubbles: true,
                    }));
                });

                cy.get('.ant-radio-button-wrapper:nth-child(3)').click().within(() => {
                    cy.get('.ant-radio-button-input').should('have.attr', 'value', 'join');
                });

                cy.get('.cvat-skeleton-configurator-svg').within(() => {
                    cy.get('circle').then(($circles) => {
                        expect($circles.length).to.be.equal(5);
                        $circles.each(function (i) {
                            const circle1 = this;
                            $circles.each(function (j) {
                                const circle2 = this;
                                if (i === j) return;
                                circle1.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                                circle1.dispatchEvent(new MouseEvent('click', { button: 0, bubbles: true }));
                                circle1.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));

                                circle2.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                                circle2.dispatchEvent(new MouseEvent('click', { button: 0, bubbles: true }));
                                circle2.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
                            });
                        });
                    });
                });

                cy.contains('Continue').scrollIntoView().click();
                cy.contains('Continue').scrollIntoView().click();
                cy.get('input[type="file"]').attachFile(archiveName, { subjectType: 'drag-n-drop' });

                cy.intercept('/api/tasks?**').as('taskPost');
                cy.contains('Submit & Open').scrollIntoView().click();

                cy.wait('@taskPost').then((interception) => {
                    taskID = interception.response.body.id;
                    expect(interception.response.statusCode).to.be.equal(201);
                    cy.intercept(`/api/tasks/${taskID}?**`).as('getTask');
                    cy.wait('@getTask', { timeout: 10000 });
                    cy.get('.cvat-task-jobs-table-row').should('exist').and('be.visible');
                    cy.openJob();
                });
            });
        });
    });

    describe('Working with objects', () => {
        function createSkeletonObject(shapeType) {
            cy.createSkeleton({
                labelName,
                xtl: 100,
                ytl: 100,
                xbr: 300,
                ybr: 300,
                type: `${shapeType[0].toUpperCase()}${shapeType.slice(1).toLowerCase()}`,
            });
            cy.get('#cvat_canvas_shape_1').should('exist').and('be.visible');
            cy.get('#cvat-objects-sidebar-state-item-1').should('exist').and('be.visible')
                .within(() => {
                    cy.get('.cvat-objects-sidebar-state-item-object-type-text').should('have.text', `SKELETON ${shapeType}`.toUpperCase());
                    cy.get('.cvat-objects-sidebar-state-item-label-selector').within(() => {
                        cy.get('input').should('be.disabled');
                    });
                    cy.get('.cvat-objects-sidebar-state-item-elements-collapse').should('exist').and('be.visible').click();
                    cy.get('.cvat-objects-sidebar-state-item-elements').should('have.length', skeletonSize);
                });
        }

        function deleteSkeleton(selector, shapeType, force) {
            cy.get(selector).trigger('mousemove').should('have.class', 'cvat_canvas_shape_activated');
            cy.get('body').type(force ? '{shift}{del}' : '{del}');
            if (shapeType.toLowerCase() === 'track' && !force) {
                cy.get('.cvat-remove-object-confirm-wrapper').should('exist').and('be.visible');
                cy.get('.ant-modal-content').within(() => {
                    cy.contains('Yes').click();
                });
            }
            cy.get(selector).should('not.exist');
        }

        it('Creating and removing a skeleton shape', () => {
            createSkeletonObject('shape');
            deleteSkeleton('#cvat_canvas_shape_1', 'shape', false);
            cy.removeAnnotations();
        });

        it('Creating and removing a skeleton track', () => {
            createSkeletonObject('track');
            deleteSkeleton('#cvat_canvas_shape_1', 'track', false);

            cy.removeAnnotations();

            createSkeletonObject('track');
            deleteSkeleton('#cvat_canvas_shape_1', 'track', true);

            cy.removeAnnotations();
        });

        it('Splitting two skeletons and merge them back', () => {
            createSkeletonObject('track');

            const splittingFrame = Math.trunc(imageParams.count / 2);
            cy.goCheckFrameNumber(splittingFrame);

            cy.get('.cvat-split-track-control').click();
            cy.get('#cvat_canvas_shape_1').click().click();

            // check objects after splitting
            cy.get('#cvat_canvas_shape_1').should('not.exist');
            cy.get('#cvat_canvas_shape_18').should('exist').and('not.be.visible');
            cy.get('#cvat_canvas_shape_24').should('exist').and('be.visible');

            cy.goToNextFrame(splittingFrame + 1);

            cy.get('#cvat_canvas_shape_18').should('not.exist');
            cy.get('#cvat_canvas_shape_24').should('exist').and('be.visible');

            // now merge them back
            cy.get('.cvat-merge-control').click();
            cy.get('#cvat_canvas_shape_24').click();

            cy.goCheckFrameNumber(0);

            cy.get('#cvat_canvas_shape_18').click();
            cy.get('body').type('m');

            // and check objects after merge
            cy.get('#cvat_canvas_shape_18').should('not.exist');
            cy.get('#cvat_canvas_shape_24').should('not.exist');

            cy.get('#cvat_canvas_shape_30').should('exist').and('be.visible');
            cy.goCheckFrameNumber(splittingFrame + 1);
            cy.get('#cvat_canvas_shape_30').should('exist').and('be.visible');
            cy.goCheckFrameNumber(imageParams.count - 1);
            cy.get('#cvat_canvas_shape_30').should('exist').and('be.visible');

            cy.removeAnnotations();
        });
    });
});
