const _ = require('lodash');
const randexp = require('randexp');
const chalk = require('chalk');
const fs = require('fs');
const constants = require('./generator-constants');

/* Constants use throughout */
const INTERPOLATE_REGEX = constants.INTERPOLATE_REGEX;
const SERVER_MAIN_SRC_DIR = constants.SERVER_MAIN_SRC_DIR;
const SERVER_MAIN_RES_DIR = constants.SERVER_MAIN_RES_DIR;
const TEST_DIR = constants.TEST_DIR;
const SERVER_TEST_SRC_DIR = constants.SERVER_TEST_SRC_DIR;

const SERVER_TEMPLATES_DIR = 'server';

/**
* The default is to use a file path string. It implies use of the template method.
* For any other config an object { file:.., method:.., template:.. } can be used
*/
const serverFiles = {
    db: [
        {
            condition: generator => generator.databaseType === 'sql',
            path: SERVER_MAIN_RES_DIR,
            templates: [{
                file: 'config/liquibase/changelog/_added_entity.xml',
                options: { interpolate: INTERPOLATE_REGEX },
                renameTo: generator => `config/liquibase/changelog/${generator.changelogDate}_added_entity_${generator.entityClass}.xml`
            }]
        },
        {
            condition: generator => generator.databaseType === 'sql' && (generator.fieldsContainOwnerManyToMany || generator.fieldsContainOwnerOneToOne || generator.fieldsContainManyToOne),
            path: SERVER_MAIN_RES_DIR,
            templates: [{
                file: 'config/liquibase/changelog/_added_entity_constraints.xml',
                options: { interpolate: INTERPOLATE_REGEX },
                renameTo: generator => `config/liquibase/changelog/${generator.changelogDate}_added_entity_constraints_${generator.entityClass}.xml`
            }]
        },
        {
            condition: generator => generator.databaseType === 'cassandra',
            path: SERVER_MAIN_RES_DIR,
            templates: [{
                file: 'config/cql/changelog/_added_entity.cql',
                renameTo: generator => `config/cql/changelog/${generator.changelogDate}_added_entity_${generator.entityClass}.cql`
            }]
        }
    ],
    server: [
        {
            path: SERVER_MAIN_SRC_DIR,
            templates: [
                {
                    file: 'package/domain/_Entity.groovy',
                    renameTo: generator => `${generator.packageFolder}/domain/${generator.entityClass}.groovy`
                },
                {
                    file: 'package/repository/_EntityRepository.groovy',
                    renameTo: generator => `${generator.packageFolder}/repository/${generator.entityClass}Repository.groovy`
                },
                {
                    file: 'package/web/rest/_EntityResource.groovy',
                    renameTo: generator => `${generator.packageFolder}/web/rest/${generator.entityClass}Resource.groovy`
                }
            ]
        },
        {
            condition: generator => generator.searchEngine === 'elasticsearch',
            path: SERVER_MAIN_SRC_DIR,
            templates: [{
                file: 'package/repository/search/_EntitySearchRepository.groovy',
                renameTo: generator => `${generator.packageFolder}/repository/search/${generator.entityClass}SearchRepository.groovy`
            }]
        },
        {
            condition: generator => generator.service === 'serviceImpl',
            path: SERVER_MAIN_SRC_DIR,
            templates: [
                {
                    file: 'package/service/_EntityService.groovy',
                    renameTo: generator => `${generator.packageFolder}/service/${generator.entityClass}Service.groovy`
                },
                {
                    file: 'package/service/impl/_EntityServiceImpl.groovy',
                    renameTo: generator => `${generator.packageFolder}/service/impl/${generator.entityClass}ServiceImpl.groovy`
                }
            ]
        },
        {
            condition: generator => generator.service === 'serviceClass',
            path: SERVER_MAIN_SRC_DIR,
            templates: [{
                file: 'package/service/impl/_EntityServiceImpl.groovy',
                renameTo: generator => `${generator.packageFolder}/service/${generator.entityClass}Service.groovy`
            }]
        },
        {
            condition: generator => generator.dto === 'mapstruct',
            path: SERVER_MAIN_SRC_DIR,
            templates: [
                {
                    file: 'package/service/dto/_EntityDTO.groovy',
                    renameTo: generator => `${generator.packageFolder}/service/dto/${generator.entityClass}DTO.groovy`
                },
                {
                    file: 'package/service/mapper/_EntityMapper.groovy',
                    renameTo: generator => `${generator.packageFolder}/service/mapper/${generator.entityClass}Mapper.groovy`
                }
            ]
        }
    ],
    test: [
        {
            path: SERVER_TEST_SRC_DIR,
            templates: [{
                file: 'package/web/rest/_EntityResourceIntTest.groovy',
                options: { context: { randexp, _, chalkRed: chalk.red, fs, SERVER_TEST_SRC_DIR } },
                renameTo: generator => `${generator.packageFolder}/web/rest/${generator.entityClass}ResourceIntTest.groovy`
            }]
        },
        {
            condition: generator => generator.gatlingTests,
            path: TEST_DIR,
            templates: [{
                file: 'gatling/simulations/_EntityGatlingTest.scala',
                options: { interpolate: INTERPOLATE_REGEX },
                renameTo: generator => `gatling/simulations/${generator.entityClass}GatlingTest.scala`
            }]
        }
    ]
};

module.exports = {
    writeFiles,
    serverFiles
};

function writeFiles() {
    return {
        saveRemoteEntityPath() {
            if (_.isUndefined(this.microservicePath)) {
                return;
            }
            this.copy(`${this.microservicePath}/${this.jhipsterConfigDirectory}/${this.entityNameCapitalized}.json`, this.destinationPath(`${this.jhipsterConfigDirectory}/${this.entityNameCapitalized}.json`));
        },

        writeServerFiles() {
            // write server side files
            this.writeFilesToDisk(serverFiles, this, false, SERVER_TEMPLATES_DIR);

            if (this.databaseType === 'sql') {
                if (this.fieldsContainOwnerManyToMany || this.fieldsContainOwnerOneToOne || this.fieldsContainManyToOne) {
                    this.addConstraintsChangelogToLiquibase(`${this.changelogDate}_added_entity_constraints_${this.entityClass}`);
                }
                this.addChangelogToLiquibase(`${this.changelogDate}_added_entity_${this.entityClass}`);

                if (this.hibernateCache === 'ehcache') {
                    this.addEntityToEhcache(this.entityClass, this.relationships, this.packageName, this.packageFolder);
                }
            }
        },

        writeEnumFiles() {
            this.fields.forEach((field) => {
                if (field.fieldIsEnum === true) {
                    const fieldType = field.fieldType;
                    field.enumInstance = _.lowerFirst(fieldType);
                    const enumInfo = {
                        enumName: fieldType,
                        enumValues: field.fieldValues,
                        enumInstance: field.enumInstance,
                        enums: field.fieldValues.replace(/\s/g, '').split(','),
                        packageName: this.packageName
                    };
                    this.template(
                        `${SERVER_TEMPLATES_DIR}/${SERVER_MAIN_SRC_DIR}package/domain/enumeration/_Enum.groovy`,
                        `${SERVER_MAIN_SRC_DIR}${this.packageFolder}/domain/enumeration/${fieldType}.groovy`,
                        this, {}, enumInfo
                    );
                }
            });
        }

    };
}
